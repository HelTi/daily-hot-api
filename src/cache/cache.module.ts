import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    NestRedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        options: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
        onClientReady: (client) => {
          console.log('Redis client ready', client);
        },
      }),
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
