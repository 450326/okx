// 引入 NestJS 验证管道
import { ValidationPipe } from '@nestjs/common';
// 引入 NestJS 核心工厂方法
import { NestFactory } from '@nestjs/core';
// 引入应用根模块
import { AppModule } from './app.module';

// 应用启动引导函数
async function bootstrap() {
  // 创建 NestJS 应用实例
  const app = await NestFactory.create(AppModule);

  // 设置全局路由前缀
  app.setGlobalPrefix('api/v1');
  // 启用跨域请求支持
  app.enableCors();
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

  // 启动 HTTP 服务，监听 3000 端口
  await app.listen(3000);
}

// 执行应用启动
bootstrap();
