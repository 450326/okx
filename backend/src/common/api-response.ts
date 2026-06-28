export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  requestId: string;
  ts: number;
}

export function ok<T>(data: T, message = 'ok'): ApiResponse<T> {
  return {
    code: 0,
    message,
    data,
    requestId: `req_${Date.now()}`,
    ts: Date.now(),
  };
}

export function fail<T = null>(message: string, code = -1, data: T = null as T): ApiResponse<T> {
  return {
    code,
    message,
    data,
    requestId: `req_${Date.now()}`,
    ts: Date.now(),
  };
}
