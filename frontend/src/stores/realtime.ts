import { ref } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import type { AssetSnapshot, AppNotification, OrderItem, PositionItem } from '../api/types';
import { useAssetStore } from './assets';
import { useOrderStore } from './orders';
import { usePositionStore } from './positions';
import { useModeStore } from './mode';
import { useNotificationStore } from './notifications';
import { getServerBaseUrl } from '../config/api';
import { invalidateApiCache } from '../api/http';

export const useRealtimeStore = defineStore('realtime', () => {
  const connected = ref(false);
  const disconnected = ref(false);
  const started = ref(false);
  const lastEventAt = ref('');

  let socket: Socket | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let hasConnected = false;

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

  function startFallback(): void {
    if (fallbackTimer) return;
    void reconcile();
    fallbackTimer = setInterval(() => {
      void reconcile();
    }, 5000);
  }

  function stopFallback(): void {
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  function onConnect(): void {
    connected.value = true;
    disconnected.value = false;
    stopFallback();
    if (hasConnected) {
      // 重连必须拉全量快照，弥补断线期间漏掉的事件。
      void reconcile();
    }
    hasConnected = true;
  }

  function onDisconnect(): void {
    connected.value = false;
    disconnected.value = true;
    startFallback();
  }

  function start(): void {
    if (started.value) return;
    started.value = true;
    socket = io(`${getServerBaseUrl()}/account`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: { token: localStorage.getItem('accessToken') || '' },
    });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', () => {
      connected.value = false;
      disconnected.value = true;
      if (socket) socket.auth = { token: localStorage.getItem('accessToken') || '' };
      startFallback();
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
    stopFallback();
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
