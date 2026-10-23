import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { HotListsService } from '../../host-lists/hot-lists.service';
import { HotItemRepository } from '../../database/repositories/hot-item.repository';
import { SourceConfigRepository } from '../../database/repositories/source-config.repository';
import { ConfigService } from '@nestjs/config';
import { HotListItem } from '../../host-lists/interfaces/hot-list.interface';

export interface FetchResult {
  sourceName: string;
  success: boolean;
  duration: number;
  savedCount: number;
  totalCount: number;
  items?: HotListItem[];
  error?: string;
}

@Injectable()
export class FetchHotDataTask implements BeforeApplicationShutdown {
  private readonly logger = new Logger(FetchHotDataTask.name);
  private readonly maxConcurrency = 5;
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly inFlight = new Map<string, Promise<FetchResult>>();
  private shuttingDown = false;
  private readonly ignoredSaveSources: Set<string>;

  constructor(
    private readonly hotListsService: HotListsService,
    private readonly hotItemRepository: HotItemRepository,
    private readonly sourceConfigRepository: SourceConfigRepository,
    configService: ConfigService,
  ) {
    this.ignoredSaveSources = new Set(
      (configService.get<string>('IGNORE_SAVE_SOURCES') ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    );
  }

  /**
   * 执行单个数据源的数据抓取
   */
  execute(sourceName: string): Promise<FetchResult> {
    const current = this.inFlight.get(sourceName);
    if (current !== undefined) return current;
    if (this.shuttingDown) {
      return Promise.resolve({
        sourceName,
        success: false,
        duration: 0,
        savedCount: 0,
        totalCount: 0,
        error: 'Application is shutting down',
      });
    }

    const pending = this.withSlot(() => this.executeSource(sourceName));
    this.inFlight.set(sourceName, pending);
    void pending.then(
      () => this.inFlight.delete(sourceName),
      () => this.inFlight.delete(sourceName),
    );
    return pending;
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.inFlight.size === 0) return;
    this.logger.log(
      `Waiting for ${this.inFlight.size} active fetches to finish`,
    );
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.inFlight.values()]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 30_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async withSlot<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < this.maxConcurrency) {
      this.active++;
    } else {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    try {
      return await operation();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }

  private async executeSource(sourceName: string): Promise<FetchResult> {
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

      // 网络层只重试瞬时 HTTP 故障；解析等错误在这里记录为失败。
      const hotListData = await this.hotListsService.fetchSource(
        sourceName,
        {},
        true,
      );

      if (!hotListData || !hotListData.data || hotListData.data.length === 0) {
        result.error = `No data received for source: ${sourceName}`;
        this.logger.warn(result.error);
        return result;
      }

      result.totalCount = hotListData.data.length;
      result.items = hotListData.data;

      const savedCount = this.ignoredSaveSources.has(sourceName)
        ? 0
        : await this.hotItemRepository.saveHotItems(
            hotListData.data,
            sourceName,
          );

      result.savedCount = savedCount;
      result.success = true;

      // 更新最后抓取时间
      await this.sourceConfigRepository.updateLastFetchTime(sourceName);

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
  async executeBatch(sourceNames: string[]): Promise<FetchResult[]> {
    const startTime = Date.now();
    this.logger.log(
      `🚀 Starting batch fetch for ${sourceNames.length} sources with max concurrency: ${this.maxConcurrency}`,
    );

    const results = await Promise.all(
      sourceNames.map((source) => this.execute(source)),
    );

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
}
