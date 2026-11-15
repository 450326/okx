import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from './error-codes';
import { fail } from './api-response';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
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
  }
}
