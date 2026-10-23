import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';

process.on('unhandledRejection', (reason) => {
  const name = reason instanceof Error ? reason.name : typeof reason;
  if (
    name === 'MongoTopologyClosedError' ||
    name === 'MongoServerSelectionError'
  ) {
    console.warn(`MongoDB connection unavailable: ${name}`);
    return;
  }
  console.error(`Unhandled Rejection: ${name}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  if (
    error.name === 'MongoTopologyClosedError' ||
    error.name === 'MongoServerSelectionError'
  ) {
    console.warn(
      'MongoDB connection error caught globally, service continues running',
    );
    return;
  }
  console.error(`Uncaught Exception: ${error.name}: ${error.message}`);
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  // 启用全局验证管道，支持 class-transformer
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 配置模板引擎 - 使用项目根目录的 views 路径
  app.setBaseViewsDir(join(process.cwd(), 'views'));
  app.setViewEngine('hbs');

  // 跨域设置
  const config = app.get(ConfigService);
  const allowedDomain = config.get<string>('ALLOWED_DOMAIN', '*');
  app.enableCors({
    origin: allowedDomain,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  console.log(`Server is running on port http://localhost:${port}`);
}

bootstrap().catch((err: any) => console.error('Bootstrap error:', err));
