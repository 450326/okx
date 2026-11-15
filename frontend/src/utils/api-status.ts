import { reactive } from 'vue';

/** 全局 API 陈旧数据标记；页面顶部据此展示降级提示。 */
export const apiStatus = reactive({
  stale: {} as Record<string, string>,
});

export function markStale(key: string, label: string): void {
  apiStatus.stale[key] = label;
}

export function markFresh(key: string): void {
  delete apiStatus.stale[key];
}

export function staleCount(): number {
  return Object.keys(apiStatus.stale).length;
}

export function clearStale(): void {
  for (const key of Object.keys(apiStatus.stale)) delete apiStatus.stale[key];
}
