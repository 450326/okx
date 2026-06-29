// 通用 API 响应接口定义
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  requestId: string;
  ts: number;
}

// 成功响应的快捷构造方法
export function ok<T>(data: T, message = 'ok'): ApiResponse<T> {
  return {
    code: 0,
    message,
    data,
    requestId: `req_${Date.now()}`,
    ts: Date.now(),
  };
}

// 失败响应的快捷构造方法
export function fail<T = null>(message: string, code = -1, data: T = null as T): ApiResponse<T> {
  return {
    code,
    message,
    data,
    requestId: `req_${Date.now()}`,
    ts: Date.now(),
  };
}
