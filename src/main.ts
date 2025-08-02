import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3030;
  // 跨域设置
  const config = app.get(ConfigService);
  const allowedDomain = config.get<string>('ALLOWED_DOMAIN', '*');
  app.enableCors({
    origin: allowedDomain,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });
  await app.listen(port);
  console.log(`Server is running on port http://localhost:${port}`);
}

bootstrap().catch((err: any) => console.error('Bootstrap error:', err));
