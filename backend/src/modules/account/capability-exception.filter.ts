import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { fail } from '../../common/api-response';
import { CapabilityError } from './capability.service';

@Catch(CapabilityError)
export class CapabilityExceptionFilter implements ExceptionFilter {
  catch(error: CapabilityError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response.status(200).json(
      fail(error.message, error.code, {
        capability: error.capability,
        state: error.state,
      }),
    );
  }
}
