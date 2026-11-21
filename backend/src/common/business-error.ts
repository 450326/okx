/**
 * 业务异常基类。
 *
 * 这类错误代表「用户操作被拒绝」，不是服务端故障：统一异常过滤器会把它渲染成
 * HTTP 200 + `{ code, message, data }`，前端 http 拦截器只看业务码，不会被
 * axios 的 reject 分支吞掉。
 *
 * 放在 common 里，是为了让全局过滤器只依赖这一个基类，而不是反向依赖
 * simulation / account 各模块自己的错误类型（避免 common ↔ modules 循环引用）。
 */
export class BusinessError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
