import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export type DesktopBackendState = 'unknown' | 'starting' | 'running' | 'paused' | 'stopped' | 'error';

export interface DesktopBackendStatus {
  state: DesktopBackendState;
  message?: string;
  port?: number;
}

interface DesktopBackendBridge {
  getStatus: () => Promise<DesktopBackendStatus>;
  start: () => Promise<DesktopBackendStatus>;
  pause: () => Promise<DesktopBackendStatus>;
  restart: () => Promise<DesktopBackendStatus>;
  onStatus: (callback: (status: DesktopBackendStatus) => void) => () => void;
}

declare global {
  interface Window {
    desktopBackend?: DesktopBackendBridge;
  }
}

/**
 * 桌面壳（Electron）的后端开关状态。
 *
 * 浏览器里没有 window.desktopBackend，商店整体处于 available=false，
 * 所有界面元素都不渲染，Web 版本行为不变。
 */
export const useDesktopBackendStore = defineStore('desktopBackend', () => {
  const bridge = typeof window === 'undefined' ? undefined : window.desktopBackend;
  const available = Boolean(bridge);
  const state = ref<DesktopBackendState>('unknown');
  const message = ref('');
  const busy = ref(false);
  let unsubscribe: (() => void) | null = null;

  const isRunning = computed(() => state.value === 'running');
  // unknown 是首帧占位，不盖界面；其余非 running 状态都算「不可用」
  const blocked = computed(() => available && state.value !== 'running' && state.value !== 'unknown');

  function apply(status: DesktopBackendStatus | null | undefined): void {
    if (!status) return;
    state.value = status.state;
    message.value = status.message || '';
  }

  async function refresh(): Promise<void> {
    if (!bridge) return;
    try {
      apply(await bridge.getStatus());
    } catch {
      // 拿不到状态时保持 unknown，不影响 Web 端
    }
  }

  function listen(): void {
    if (!bridge || unsubscribe) return;
    unsubscribe = bridge.onStatus(apply);
  }

  async function run(action: () => Promise<DesktopBackendStatus>): Promise<void> {
    if (!bridge || busy.value) return;
    busy.value = true;
    try {
      apply(await action());
    } catch (error) {
      message.value = (error as Error).message || String(error);
    } finally {
      busy.value = false;
    }
  }

  function start(): Promise<void> {
    return bridge ? run(() => bridge.start()) : Promise.resolve();
  }

  function pause(): Promise<void> {
    return bridge ? run(() => bridge.pause()) : Promise.resolve();
  }

  function toggle(): Promise<void> {
    return state.value === 'running' ? pause() : start();
  }

  return { available, state, message, busy, isRunning, blocked, refresh, listen, start, pause, toggle };
});
