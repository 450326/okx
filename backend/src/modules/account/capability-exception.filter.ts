import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { CapabilityError } from './capability.service';

@Catch(CapabilityError)
export class CapabilityExceptionFilter implements ExceptionFilter {
  catch(error: CapabilityError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response.status(200).json({
      code: error.code,
      message: error.message,
      data: {
        capability: error.capability,
        state: error.state,
      },
      requestId: `req_${Date.now()}`,
      ts: Date.now(),
    });
  }
}
