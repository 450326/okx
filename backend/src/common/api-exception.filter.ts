import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BusinessError } from './business-error';
import { fail } from './api-response';
import { ERROR_CODES } from './error-codes';

/**
 * 全局唯一异常出口。
 *
 * 之前按错误类型注册了 4 个 APP_FILTER（模拟盘 / 能力矩阵 / 实盘下单 / HTTP），
 * 新增错误类型时很容易漏注册，异常就会掉进 Nest 默认处理、丢掉业务码。
 * 现在只有这一个：先识别 BusinessError，再处理 HttpException，最后兜底 500。
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      // WebSocket 等非 HTTP 上下文不写 HTTP 响应，只记录
      this.logger.error(`非 HTTP 上下文异常: ${this.describe(exception)}`);
      return;
    }

    const response = host.switchToHttp().getResponse();

    if (exception instanceof BusinessError) {
      response.status(200).json(fail(exception.message, exception.code, exception.details));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const body = typeof raw === 'string' ? { message: raw } : (raw as Record<string, unknown>);
      const code =
        status === HttpStatus.UNAUTHORIZED
          ? ERROR_CODES.UNAUTHORIZED
          : status === HttpStatus.FORBIDDEN
            ? ERROR_CODES.FORBIDDEN
            : status === HttpStatus.TOO_MANY_REQUESTS
              ? ERROR_CODES.RATE_LIMITED
              : ERROR_CODES.BAD_REQUEST;
      const message =
        typeof body.message === 'string'
          ? body.message
          : Array.isArray(body.message)
            ? body.message.join('; ')
            : exception.message;
      response.status(status).json({
        ...fail(message, code),
        statusCode: status,
      });
      return;
    }

    this.logger.error(
      `未处理异常: ${this.describe(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ...fail('服务器内部错误，请稍后重试', ERROR_CODES.INTERNAL_ERROR),
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }

  private describe(exception: unknown): string {
    if (exception instanceof Error) return `${exception.name}: ${exception.message}`;
    return typeof exception === 'string' ? exception : JSON.stringify(exception);
  }
}
