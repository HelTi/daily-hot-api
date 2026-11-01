import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { existsSync } from 'fs';
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

/**
 * 解析模板目录。
 *
 * CLI 通过 npm 全局安装后可能在任意 cwd 启动，模板必须相对包根目录解析；
 * 同时保留 cwd/views 作为兜底，兼容把 dist 拷到其他目录运行的旧部署方式。
 */
export function resolveViewsDir(): string {
  const packageRootViews = join(__dirname, '..', 'views');
  if (existsSync(packageRootViews)) {
    return packageRootViews;
  }
  return join(process.cwd(), 'views');
}

export async function bootstrap(): Promise<NestExpressApplication> {
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

  // 配置模板引擎 - 优先使用包根目录的 views，兼容 npm 全局安装的 CLI
  app.setBaseViewsDir(resolveViewsDir());
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
  return app;
}

async function main(): Promise<void> {
  const app = await bootstrap();
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  console.log(`Server is running on port http://localhost:${port}`);
}

// 只有直接执行 dist/main 时才自动启动；被 CLI require 时导出 bootstrap 供其复用。
if (require.main === module) {
  main().catch((err: any) => {
    console.error('Bootstrap error:', err);
    process.exitCode = 1;
  });
}
