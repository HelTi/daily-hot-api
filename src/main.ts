import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  const port = process.env.PORT ?? 6688;
  await app.listen(port);
  console.log(`Server is running on port http://localhost:${port}`);
}

bootstrap().catch((err: any) => console.error('Bootstrap error:', err));
