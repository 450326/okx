import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { fail } from '../../common/api-response';
import { LiveOrderError } from './live-trading.service';

@Catch(LiveOrderError)
export class LiveOrderExceptionFilter implements ExceptionFilter {
  catch(error: LiveOrderError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response.status(200).json(
      fail(error.message, error.code, {
        clientOrderId: error.clientOrderId,
      }),
    );
  }
}
