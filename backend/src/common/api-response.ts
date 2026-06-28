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
