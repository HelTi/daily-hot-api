import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';

export type CacheData<T> = {
  data: T; // 缓存数据
  updateTime: string; // 缓存更新时间
};

@Injectable()
export class CacheService {
  private readonly DEFAULT_TTL: number;
  private readonly logger = new Logger(CacheService.name);
  private useMemoryCache = false; // 标记是否使用内存缓存

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly memoryCache: Cache,
  ) {
    // 默认缓存时间为1小时
    this.DEFAULT_TTL = this.configService.get<number>('CACHE_TTL', 3600);
    void this.checkRedisConnection();
  }

  // 检查Redis连接状态
  private async checkRedisConnection(): Promise<void> {
    try {
      await this.redis.ping();
      this.logger.log('Redis 连接正常');
    } catch {
      this.useMemoryCache = true;
      this.logger.warn('Redis 不可用，已降级到内存缓存');
    }
  }

  /**
   * 获取缓存数据
   * @param key 缓存键
   * @returns 缓存数据或null
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.useMemoryCache) {
      return this.getFromMemory<T>(key);
    }
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
    if (this.useMemoryCache) {
      return this.setToMemory(key, value, ttl);
    }
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
    if (this.useMemoryCache) {
      return this.delFromMemory(key);
    }
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
    if (this.useMemoryCache) {
      return this.delFromMemory(prefix);
    }
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

  // =============== 内存缓存方法 ===============
  private async getFromMemory<T>(key: string): Promise<T | null> {
    try {
      const data = await this.memoryCache.get<T>(key);
      this.logger.debug(`[MEMORY] Cache hit for key: ${key}`);
      return data as T;
    } catch (error) {
      this.logger.error(`内存缓存读取失败: ${error.message}`);
      return null;
    }
  }

  private async setToMemory(
    key: string,
    value: CacheData<unknown>,
    ttl: number,
  ): Promise<void> {
    try {
      await this.memoryCache.set(key, value, ttl * 1000); // 转换为毫秒
      this.logger.log(`💾 [MEMORY] ${key} cached for ${ttl}s`);
    } catch (error) {
      this.logger.error(`内存缓存写入失败: ${error.message}`);
    }
  }

  private async delFromMemory(key: string): Promise<void> {
    try {
      await this.memoryCache.del(key);
      this.logger.log(`🗑️ [MEMORY] Deleted cache for ${key}`);
    } catch (error) {
      this.logger.error(`内存缓存删除失败: ${error.message}`);
    }
  }
}
