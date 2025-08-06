import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';

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
          lazyConnect: true, // 启动不握手
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          retryStrategy: () => null,
        },
        onClientReady: (client) => {
          console.log('Redis client ready', client);
        },
        onClientError: (error) => {
          console.error('Redis client error', error);
        },
      }),
    }),
    NestCacheModule.register({
      ttl: 0, // 默认禁用全局TTL（由业务代码控制）
      max: 1000, // 内存缓存最大项目数
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
