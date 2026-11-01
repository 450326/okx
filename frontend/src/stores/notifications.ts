import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import { notificationApi } from '../api/services';
import type { AppNotification } from '../api/types';

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref<AppNotification[]>([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  const panelOpen = ref(false);
  const toast = ref<AppNotification | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let socket: Socket | null = null;
  let initialized = false;

  const hasUnread = computed(() => unreadCount.value > 0);

  async function fetchNotifications(showToast = true) {
    loading.value = true;
    try {
      const result = await notificationApi.list(80);
      const previousIds = new Set(notifications.value.map((item) => item.id));
      notifications.value = result.list;
      unreadCount.value = result.unreadCount;
      if (initialized && showToast) {
        const fresh = result.list.find((item) => !previousIds.has(item.id));
        if (fresh) toast.value = fresh;
      }
      initialized = true;
    } catch {
      // 通知轮询失败不打断交易页面；下一次轮询自动恢复。
    } finally {
      loading.value = false;
    }
  }

  async function markRead(id: string) {
    const item = notifications.value.find((entry) => entry.id === id);
    if (!item || item.read) return;
    item.read = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
    try {
      await notificationApi.markRead(id);
    } catch {
      // 本地已标记，下一次拉取会校正。
    }
  }

  async function markAllRead() {
    notifications.value = notifications.value.map((item) => ({ ...item, read: true }));
    unreadCount.value = 0;
    try {
      await notificationApi.markAllRead();
    } catch {
      // 下一次拉取会校正。
    }
  }

  function dismissToast() {
    toast.value = null;
  }

  function startPolling() {
    if (pollTimer) return;
    void fetchNotifications(false);
    socket = io('http://localhost:3000/notifications', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      auth: { token: localStorage.getItem('accessToken') || '' },
    });
    socket.on('notification', (notification: AppNotification) => {
      if (!notification?.id || notifications.value.some((item) => item.id === notification.id)) return;
      notifications.value.unshift(notification);
      unreadCount.value += 1;
      toast.value = notification;
    });
    pollTimer = setInterval(() => {
      void fetchNotifications(true);
    }, 10000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    socket?.disconnect();
    socket = null;
    initialized = false;
    panelOpen.value = false;
    toast.value = null;
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value;
    if (panelOpen.value) void fetchNotifications(false);
  }

  return {
    notifications,
    unreadCount,
    loading,
    panelOpen,
    toast,
    hasUnread,
    fetchNotifications,
    markRead,
    markAllRead,
    dismissToast,
    startPolling,
    stopPolling,
    togglePanel,
  };
});
