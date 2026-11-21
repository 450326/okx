import { ref } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import type { AssetSnapshot, AppNotification, OrderItem, PositionItem } from '../api/types';
import { useAssetStore } from './assets';
import { useOrderStore } from './orders';
import { usePositionStore } from './positions';
import { useModeStore } from './mode';
import { useNotificationStore } from './notifications';
import { useAuthStore } from './auth';
import { getServerBaseUrl } from '../config/api';
import { invalidateApiCache } from '../api/http';

// 重连策略：有限次数 + 指数退避，避免后端不可达时无限重连
const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_DELAY_MS = 2000;
const RECONNECT_DELAY_MAX_MS = 30000;
// 连续失败若干次后才降级轮询；轮询间隔放宽，避免「重连 + 轮询」双重请求风暴
const FALLBACK_START_AFTER_FAILURES = 2;
const FALLBACK_INTERVAL_MS = 15000;
// 自动重连次数耗尽后，每分钟最多手动重试一次
const SLOW_RETRY_MS = 60000;

export const useRealtimeStore = defineStore('realtime', () => {
  const connected = ref(false);
  const disconnected = ref(false);
  const started = ref(false);
  const lastEventAt = ref('');

  let socket: Socket | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let slowRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let hasConnected = false;
  let connectFailures = 0;
  let refreshingToken = false;

  function applyAccount(payload: AssetSnapshot): void {
    const assets = useAssetStore();
    assets.snapshot = payload;
    invalidateApiCache(['/account']);
  }

  function applyPositions(payload: { positions?: PositionItem[] }): void {
    const positions = usePositionStore();
    positions.positions = Array.isArray(payload?.positions) ? payload.positions : [];
    invalidateApiCache(['/positions']);
  }

  function applyOrders(payload: { orders?: OrderItem[]; history?: OrderItem[] }): void {
    const orders = useOrderStore();
    orders.openOrders = Array.isArray(payload?.orders) ? payload.orders : [];
    if (Array.isArray(payload?.history)) {
      orders.historyOrders = payload.history;
    }
    invalidateApiCache(['/orders']);
  }

  function receiveNotification(notification: AppNotification): void {
    const notificationStore = useNotificationStore();
    notificationStore.receiveNotification(notification);
  }

  async function reconcile(): Promise<void> {
    const mode = useModeStore();
    const assets = useAssetStore();
    const positions = usePositionStore();
    const orders = useOrderStore();
    await Promise.allSettled([
      assets.fetchAssets(mode.mode),
      positions.fetchPositions(mode.mode),
      orders.fetchOpenOrders(mode.mode),
    ]);
  }

  // 降级轮询：15s 一次，页面隐藏时跳过，避免后台标签页继续发请求
  function startFallback(): void {
    if (fallbackTimer) return;
    void reconcile();
    fallbackTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void reconcile();
    }, FALLBACK_INTERVAL_MS);
  }

  function stopFallback(): void {
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  function clearSlowRetry(): void {
    if (slowRetryTimer) clearTimeout(slowRetryTimer);
    slowRetryTimer = null;
  }

  // socket.io 自动重连次数用尽后，改为每分钟最多尝试一次，并保持轮询兜底
  function scheduleSlowRetry(): void {
    if (slowRetryTimer || !started.value) return;
    slowRetryTimer = setTimeout(() => {
      slowRetryTimer = null;
      if (!started.value || !socket) return;
      connectFailures = 0;
      startFallback();
      socket.connect();
    }, SLOW_RETRY_MS);
  }

  function onConnect(): void {
    connected.value = true;
    disconnected.value = false;
    connectFailures = 0;
    clearSlowRetry();
    stopFallback();
    if (hasConnected) {
      // 重连必须拉全量快照，弥补断线期间漏掉的事件。
      void reconcile();
    }
    hasConnected = true;
  }

  function onDisconnect(): void {
    connected.value = false;
    if (!started.value) return;
    disconnected.value = true;
    startFallback();
  }

  function start(): void {
    if (started.value) return;
    started.value = true;
    connectFailures = 0;

    socket = io(`${getServerBaseUrl()}/account`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      randomizationFactor: 0.3,
      timeout: 10000,
      auth: { token: localStorage.getItem('accessToken') || '' },
    });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', async () => {
      connected.value = false;
      disconnected.value = true;
      connectFailures += 1;

      // token 过期时只刷新一次，避免每次重连都触发 refresh；刷新失败交给 HTTP 层统一登出
      if (!refreshingToken) {
        refreshingToken = true;
        try {
          const token = await useAuthStore().ensureFreshAccessToken();
          if (token && socket) socket.auth = { token };
        } finally {
          refreshingToken = false;
        }
      }

      if (connectFailures >= FALLBACK_START_AFTER_FAILURES) startFallback();
    });

    // 自动重连耗尽：保持轮询，并转入低频手动重试
    socket.io.on('reconnect_failed', () => {
      connected.value = false;
      disconnected.value = true;
      startFallback();
      scheduleSlowRetry();
    });

    socket.on('asset:update', (message: { payload: AssetSnapshot }) => {
      lastEventAt.value = new Date().toISOString();
      applyAccount(message.payload);
    });
    socket.on('position:update', (message: { payload: { positions?: PositionItem[] } }) => {
      lastEventAt.value = new Date().toISOString();
      applyPositions(message.payload);
    });
    socket.on('order:update', (message: { payload: { orders?: OrderItem[]; history?: OrderItem[] } }) => {
      lastEventAt.value = new Date().toISOString();
      applyOrders(message.payload);
    });
    socket.on('position:closed', () => {
      lastEventAt.value = new Date().toISOString();
      void reconcile();
      void useNotificationStore().fetchNotifications(false);
    });
    socket.on('risk:warning', (message: { payload: AppNotification }) => {
      receiveNotification(message.payload);
    });
    socket.on('notification', (message: { payload: AppNotification }) => {
      receiveNotification(message.payload);
    });
  }

  function stop(): void {
    started.value = false;
    connected.value = false;
    disconnected.value = false;
    hasConnected = false;
    connectFailures = 0;
    stopFallback();
    clearSlowRetry();
    socket?.disconnect();
    socket = null;
  }

  return {
    connected,
    disconnected,
    started,
    lastEventAt,
    start,
    stop,
    reconcile,
  };
});
