import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HotItem, HotItemDocument } from '../schemas/hot-item.schema';
import { HotListItem } from '../../host-lists/interfaces/hot-list.interface';

export interface SearchHistoryOptions {
  source?: string;
  keyword?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchHistoryResult {
  data: HotItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class HotItemRepository {
  private readonly logger = new Logger(HotItemRepository.name);

  constructor(
    @InjectModel(HotItem.name) private hotItemModel: Model<HotItemDocument>,
  ) {}

  // 检查是否存在重复数据
  async isDuplicate(source: string, url: string): Promise<boolean> {
    const existing = await this.hotItemModel.findOne({ source, url });
    return !!existing;
  }

  // 批量检查重复数据
  async getDuplicateUrls(source: string, urls: string[]): Promise<Set<string>> {
    const existingItems = await this.hotItemModel.find(
      { source, url: { $in: urls } },
      { url: 1 },
    );
    return new Set(existingItems.map((item) => item.url));
  }

  // 验证和清理数据
  private validateAndCleanItem(item: HotListItem): HotListItem | null {
    // 检查必填字段
    if (
      !item.title ||
      typeof item.title !== 'string' ||
      item.title.trim() === ''
    ) {
      return null;
    }

    return {
      ...item,
      title: item.title.trim(),
      desc: item.desc?.trim() || '',
      url: item.url,
      mobileUrl: item.mobileUrl,
      author: item.author?.trim() || '',
      hot: item.hot || 0,
    };
  }

  // 批量保存数据（去重）
  async saveHotItems(items: HotListItem[], source: string): Promise<number> {
    if (items.length === 0) return 0;

    const originalCount = items.length;
    this.logger.debug(
      `Processing ${originalCount} items for source: ${source}`,
    );

    // 1. 验证和清理数据
    const validItems = items
      .map((item) => this.validateAndCleanItem(item))
      .filter((item): item is HotListItem => item !== null);

    const validCount = validItems.length;
    const invalidCount = originalCount - validCount;

    if (invalidCount > 0) {
      this.logger.warn(
        `Filtered out ${invalidCount} invalid items for source: ${source}`,
      );
    }

    if (validItems.length === 0) {
      this.logger.warn(`No valid items to save for source: ${source}`);
      return 0;
    }

    // 2. 处理相同URL的情况
    const urlCountMap = new Map<string, number>();
    const processedItems = validItems.map((item) => {
      const baseUrl = item.url;
      const count = urlCountMap.get(baseUrl) || 0;
      urlCountMap.set(baseUrl, count + 1);

      return {
        ...item,
      };
    });

    // 3. 批量检查数据库中的重复数据
    const urls = processedItems.map((item) => item.url);
    const duplicateUrls = await this.getDuplicateUrls(source, urls);

    // 4. 过滤出非重复的数据
    const newItems = processedItems.filter(
      (item) => !duplicateUrls.has(item.url),
    );

    if (newItems.length === 0) return 0;

    // 5. 准备插入的文档
    const documents = newItems.map((item) => ({
      ...item,
      source,
      timestamp: item.timestamp || Date.now(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    try {
      // 6. 使用 upsert 策略，避免重复数据问题
      this.logger.debug(
        `Attempting to insert ${documents.length} documents for source: ${source}`,
      );

      // 逐个插入，使用 upsert 策略
      let insertedCount = 0;
      for (const doc of documents) {
        try {
          const result = await this.hotItemModel.findOneAndUpdate(
            { source: doc.source, url: doc.url },
            doc,
            { upsert: true, new: true },
          );
          if (result) {
            insertedCount++;
          }
        } catch (singleError) {
          this.logger.warn(
            `Failed to insert single document for ${source}:`,
            singleError,
          );
          // 继续处理下一个文档
        }
      }
      this.logger.log(
        `Successfully saved ${insertedCount} items for source: ${source} (${originalCount} -> ${validCount} -> ${insertedCount})`,
      );
      return insertedCount;
    } catch (error: any) {
      console.error('Insert error:', error);
      this.logger.error(`Failed to save items for source ${source}:`, error);
      return 0;
    }
  }

  // 搜索历史数据
  async searchHistory(
    options: SearchHistoryOptions,
  ): Promise<SearchHistoryResult> {
    const {
      source,
      keyword,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = options;

    // 构建查询条件
    const query: any = {};

    if (source) {
      query.source = source;
    }

    if (keyword) {
      // 使用正则表达式进行模糊搜索，支持title和desc字段
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { desc: { $regex: keyword, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = startDate.getTime();
      }
      if (endDate) {
        query.timestamp.$lte = endDate.getTime();
      }
    }

    // 构建排序条件
    const sort: any = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // 计算分页
    const skip = (page - 1) * limit;

    // 执行查询
    const [data, total] = await Promise.all([
      this.hotItemModel.find(query).sort(sort).skip(skip).limit(limit).lean(),
      this.hotItemModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 获取数据源列表
  async getSources(): Promise<string[]> {
    const sources: string[] = await this.hotItemModel.distinct('source');
    return sources.sort();
  }

  // 获取数据统计
  async getStats(): Promise<{
    totalCount: number;
    totalSources: number;
    sources: { _id: string; count: number; latestTimestamp: number }[];
  }> {
    const stats = await this.hotItemModel.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
          latestTimestamp: { $max: '$timestamp' },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const totalCount = await this.hotItemModel.countDocuments();
    const totalSources = stats.length;

    return {
      totalCount,
      totalSources,
      sources: stats,
    };
  }

  // 根据时间范围获取数据
  async getDataByTimeRange(
    source: string,
    startTime: number,
    endTime: number,
  ): Promise<HotItem[]> {
    return this.hotItemModel
      .find({
        source,
        timestamp: { $gte: startTime, $lte: endTime },
      })
      .sort({ timestamp: -1 })
      .lean();
  }
}
