import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { fail } from '../../common/api-response';
import { SimulationError } from './simulation.types';

/**
 * 把引擎抛出的业务错误转换成统一的 { code, message, data } 响应，
 * 这样前端 http 拦截器可以按业务码展示“余额不足 / 杠杆超限 / 无持仓”等原因。
 */
@Catch(SimulationError)
export class SimulationExceptionFilter implements ExceptionFilter {
  catch(exception: SimulationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response.status(200).json(fail(exception.message, exception.code));
  }
}
