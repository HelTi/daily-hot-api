import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export type CacheData<T> = {
  data: T; // 缓存数据
  updateTime: string; // 缓存更新时间
};

@Injectable()
export class CacheService {
  private readonly DEFAULT_TTL: number;
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    // 默认缓存时间为1小时
    this.DEFAULT_TTL = this.configService.get<number>('CACHE_TTL', 3600);
  }

  /**
   * 获取缓存数据
   * @param key 缓存键
   * @returns 缓存数据或null
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;

      const parsed = JSON.parse(data) as T;
      this.logger.debug(`Cache hit for key: ${key}`);
      return parsed;
    } catch (error) {
      this.logger.error(`Error getting cached data for key: ${key}`, error);
      return null;
    }
  }

  /**
   * 设置缓存数据
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间(秒)，默认1小时
   */
  async set(
    key: string,
    value: CacheData<unknown>,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
      this.logger.log(`💾 [REDIS] ${key} has been cached for ${ttl}s`);
    } catch (error) {
      this.logger.error(`Error setting cache for key: ${key}`, error);
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.log(`🗑️ [REDIS] Deleted cache for ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting cache for key: ${key}`, error);
    }
  }

  /**
   * 清除特定前缀的所有缓存
   * @param prefix 缓存键前缀
   */
  async delByPattern(prefix: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(
          `🗑️ [REDIS] Deleted ${keys.length} keys with prefix: ${prefix}`,
        );
      }
    } catch (error) {
      this.logger.error(`Error deleting cache by pattern: ${prefix}`, error);
    }
  }

  /**
   * 检查Redis连接状态
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis ping failed', error);
      return false;
    }
  }
}
