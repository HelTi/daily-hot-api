import { Injectable, Logger } from '@nestjs/common';
import { HotListsService } from '../../host-lists/hot-lists.service';
import { HotItemRepository } from '../../database/repositories/hot-item.repository';
import { SourceConfigRepository } from '../../database/repositories/source-config.repository';
import { CacheService } from '../../cache/cache.service';

interface FetchResult {
  sourceName: string;
  success: boolean;
  duration: number;
  savedCount: number;
  totalCount: number;
  error?: string;
}

@Injectable()
export class FetchHotDataTask {
  private readonly logger = new Logger(FetchHotDataTask.name);
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1秒

  constructor(
    private readonly hotListsService: HotListsService,
    private readonly hotItemRepository: HotItemRepository,
    private readonly sourceConfigRepository: SourceConfigRepository,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 执行单个数据源的数据抓取
   */
  async execute(sourceName: string): Promise<FetchResult> {
    const startTime = Date.now();
    const result: FetchResult = {
      sourceName,
      success: false,
      duration: 0,
      savedCount: 0,
      totalCount: 0,
    };

    try {
      this.logger.log(`🚀 Starting to fetch data for source: ${sourceName}`);

      // 验证数据源是否存在
      if (!this.validateSource(sourceName)) {
        result.error = `Source '${sourceName}' not found`;
        this.logger.error(result.error);
        return result;
      }

      // 检查数据源是否启用
      const sourceConfig =
        await this.sourceConfigRepository.findBySource(sourceName);
      if (sourceConfig && !sourceConfig.enabled) {
        result.error = `Source '${sourceName}' is disabled`;
        this.logger.warn(result.error);
        return result;
      }

      // 获取热点数据（带重试机制）
      const hotListData = await this.fetchWithRetry(sourceName);

      if (!hotListData || !hotListData.data || hotListData.data.length === 0) {
        result.error = `No data received for source: ${sourceName}`;
        this.logger.warn(result.error);
        return result;
      }

      result.totalCount = hotListData.data.length;

      // 保存到数据库（自动去重）
      const savedCount = await this.hotItemRepository.saveHotItems(
        hotListData.data,
        sourceName,
      );

      result.savedCount = savedCount;
      result.success = true;

      // 更新最后抓取时间
      await this.sourceConfigRepository.updateLastFetchTime(sourceName);

      // 清除相关缓存
      await this.clearSourceCache(sourceName);

      const duration = Date.now() - startTime;
      result.duration = duration;

      this.logger.log(
        `✅ Source ${sourceName}: saved ${savedCount}/${hotListData.data.length} items in ${duration}ms`,
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      result.duration = duration;
      result.error = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `❌ Failed to fetch data for ${sourceName} after ${duration}ms:`,
        error,
      );

      return result;
    }
  }

  /**
   * 批量执行多个数据源
   */
  async executeBatch(
    sourceNames: string[],
    maxConcurrency = 5,
  ): Promise<FetchResult[]> {
    const startTime = Date.now();
    this.logger.log(
      `🚀 Starting batch fetch for ${sourceNames.length} sources with max concurrency: ${maxConcurrency}`,
    );

    const results: FetchResult[] = [];

    // 使用并发控制，避免同时发起太多请求
    for (let i = 0; i < sourceNames.length; i += maxConcurrency) {
      const batch = sourceNames.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(
        batch.map((source) => this.execute(source)),
      );

      // 处理批次结果
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const sourceName = batch[index];
          results.push({
            sourceName,
            success: false,
            duration: 0,
            savedCount: 0,
            totalCount: 0,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      // 批次间延迟，避免对目标服务器造成过大压力
      if (i + maxConcurrency < sourceNames.length) {
        await this.delay(500);
      }
    }

    const totalDuration = Date.now() - startTime;
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalSaved = results.reduce((sum, r) => sum + r.savedCount, 0);
    const totalItems = results.reduce((sum, r) => sum + r.totalCount, 0);

    this.logger.log(
      `📊 Batch fetch completed in ${totalDuration}ms: ${succeeded} succeeded, ${failed} failed, ${totalSaved}/${totalItems} items saved`,
    );

    // 记录失败的源
    if (failed > 0) {
      const failedSources = results
        .filter((r) => !r.success)
        .map((r) => `${r.sourceName}(${r.error})`)
        .join(', ');
      this.logger.warn(`Failed sources: ${failedSources}`);
    }

    return results;
  }

  /**
   * 验证数据源是否存在
   */
  private validateSource(sourceName: string): boolean {
    const sources = this.hotListsService.getAllSources();
    return sources.includes(sourceName);
  }

  /**
   * 带重试机制的数据获取
   */
  private async fetchWithRetry(
    sourceName: string,
    retryCount = 0,
  ): Promise<any> {
    try {
      return await this.hotListsService.getHotList(
        sourceName,
        {},
        true, // 不使用缓存，获取最新数据
      );
    } catch (error) {
      if (retryCount < this.maxRetries) {
        this.logger.warn(
          `Retry ${retryCount + 1}/${this.maxRetries} for ${sourceName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await this.delay(this.retryDelay * Math.pow(2, retryCount)); // 指数退避
        return this.fetchWithRetry(sourceName, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * 清除数据源相关缓存
   */
  private async clearSourceCache(sourceName: string): Promise<void> {
    try {
      const cacheKey = `hotlist:${sourceName}`;
      await this.cacheService.del(cacheKey);
      this.logger.debug(`Cleared cache for source: ${sourceName}`);
    } catch (error) {
      this.logger.warn(`Failed to clear cache for ${sourceName}:`, error);
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取任务执行统计信息
   */
  getStats(): { maxRetries: number; retryDelay: number } {
    return {
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
    };
  }
}
