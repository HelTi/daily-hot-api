import { Injectable, Logger } from '@nestjs/common';
import { HotListsService } from '../../host-lists/hot-lists.service';
import { HotItemRepository } from '../../database/repositories/hot-item.repository';
import { SourceConfigRepository } from '../../database/repositories/source-config.repository';

@Injectable()
export class FetchHotDataTask {
  private readonly logger = new Logger(FetchHotDataTask.name);

  constructor(
    private readonly hotListsService: HotListsService,
    private readonly hotItemRepository: HotItemRepository,
    private readonly sourceConfigRepository: SourceConfigRepository,
  ) {}

  async execute(sourceName: string): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log(`Starting to fetch data for source: ${sourceName}`);

      // 检查数据源是否存在
      const sources = this.hotListsService.getAllSources();
      if (!sources.includes(sourceName)) {
        this.logger.error(`Source '${sourceName}' not found`);
        return;
      }

      // 获取热点数据
      const hotListData = await this.hotListsService.getHotList(
        sourceName,
        {},
        true, // 不使用缓存，获取最新数据
      );

      if (!hotListData || !hotListData.data || hotListData.data.length === 0) {
        this.logger.warn(`No data received for source: ${sourceName}`);
        return;
      }

      // 保存到数据库（自动去重）
      const savedCount = await this.hotItemRepository.saveHotItems(
        hotListData.data,
        sourceName,
      );

      this.logger.log(
        `Source ${sourceName}: saved ${savedCount} new items out of ${hotListData.data.length} total items`,
      );

      // 更新最后抓取时间
      await this.sourceConfigRepository.updateLastFetchTime(sourceName);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Completed fetching data for ${sourceName} in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error(`Failed to fetch data for ${sourceName}:`, error);
      throw error;
    }
  }

  // 批量执行多个数据源
  async executeBatch(sourceNames: string[]): Promise<void> {
    this.logger.log(`Starting batch fetch for ${sourceNames.length} sources`);

    const results = await Promise.allSettled(
      sourceNames.map((source) => this.execute(source)),
    );

    const succeeded = results.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    const failed = results.filter(
      (result) => result.status === 'rejected',
    ).length;

    this.logger.log(
      `Batch fetch completed: ${succeeded} succeeded, ${failed} failed`,
    );
  }
}
