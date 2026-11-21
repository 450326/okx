// 引入 NestJS 验证管道
import { Logger, ValidationPipe } from '@nestjs/common';
// 引入 NestJS 核心工厂方法
import { NestFactory } from '@nestjs/core';
// 引入运行时检查（必须早于任何使用 node:sqlite 的模块）
import { assertNodeSqliteRuntime } from './common/node-runtime';
// 引入统一响应信封，跨域拒绝也走同样的结构
import { fail } from './common/api-response';
// 引入错误码
import { ERROR_CODES } from './common/error-codes';

const logger = new Logger('Bootstrap');

// 开发环境默认放行的本地前端地址（Vite dev / preview）
const DEV_CORS_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
];

/**
 * CORS 白名单：
 * - CORS_ORIGINS 显式配置优先（逗号分隔，桌面端会传 `null` 对应 file:// 页面）
 * - 未配置时，仅开发环境放行本地前端；生产环境默认不放行任何跨域来源
 */
function resolveCorsOrigins(): Set<string> {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length) return new Set(configured);
  if (process.env.NODE_ENV === 'production') return new Set();
  return new Set(DEV_CORS_ORIGINS);
}

// 应用启动引导函数
async function bootstrap() {
  // 先校验 Node 版本与 node:sqlite 是否可用，避免旧版本 Node 上出现难以定位的模块错误
  assertNodeSqliteRuntime();

  // 动态引入根模块：静态 import 会在检查之前执行，从而绕过上面的提示
  const { AppModule } = await import('./app.module');

  // 创建 NestJS 应用实例
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = resolveCorsOrigins();
  logger.log(
    allowedOrigins.size
      ? `CORS 白名单：${[...allowedOrigins].join(', ')}`
      : 'CORS 白名单为空：仅接受同源 / 无 Origin 请求（如需放行请设置 CORS_ORIGINS）',
  );

  // 未授权来源直接 403，而不是只让浏览器忽略响应头：
  // 否则跨站请求虽然读不到响应，服务端副作用已经发生。
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.has(origin)) return next();
    logger.warn(`拒绝未授权跨域请求 origin=${origin} ${req.method} ${req.originalUrl}`);
    res.status(403).json(fail('CORS origin 未授权', ERROR_CODES.FORBIDDEN));
  });

  // 设置全局路由前缀
  app.setGlobalPrefix('api/v1');
  // 只回显白名单来源，且不启用 cookie 凭据（前端使用 Authorization 头）
  app.enableCors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: false,
    maxAge: 600,
  });
  // 注册全局请求验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      // 自动过滤未装饰器的属性
      whitelist: true,
      // 自动转换请求数据类型
      transform: true,
      // 禁止请求中出现未定义属性
      forbidNonWhitelisted: true,
    }),
  );

  // 启动 HTTP 服务；桌面端会传 HOST=127.0.0.1 只监听本机
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST;
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
  logger.log(`HTTP 服务已启动：${host || '0.0.0.0'}:${port}`);
}

// 执行应用启动
bootstrap();
