import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { LiveOrderError } from './live-trading.service';

@Catch(LiveOrderError)
export class LiveOrderExceptionFilter implements ExceptionFilter {
  catch(error: LiveOrderError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response.status(200).json({
      code: error.code,
      message: error.message,
      data: {
        clientOrderId: error.clientOrderId,
      },
      requestId: `req_${Date.now()}`,
      ts: Date.now(),
    });
  }
}
