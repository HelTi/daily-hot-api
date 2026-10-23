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

type HistoryStats = {
  totalCount: number;
  totalSources: number;
  sources: { _id: string; count: number; latestTimestamp: number }[];
};

@Injectable()
export class HotItemRepository {
  private readonly logger = new Logger(HotItemRepository.name);
  private statsCache?: { value: HistoryStats; expiresAt: number };
  private statsInFlight?: Promise<HistoryStats>;
  private statsVersion = 0;

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

    if (!item.url || typeof item.url !== 'string' || !item.url.trim()) {
      return null;
    }

    return {
      ...item,
      title: item.title.trim(),
      desc: item.desc?.trim() || '',
      url: item.url.trim(),
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

    // 同一批次同一 URL 只保留排名靠前的条目，避免重复 upsert 计数失真。
    const seenUrls = new Set<string>();
    const uniqueItems = validItems.filter((item) => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    });
    const now = new Date();
    const operations = uniqueItems.map((item) => ({
      updateOne: {
        filter: { source, url: item.url },
        update: {
          $setOnInsert: {
            ...item,
            source,
            timestamp: item.timestamp || now.getTime(),
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }));

    try {
      const result = await this.hotItemModel.bulkWrite(operations, {
        ordered: false,
        timestamps: false,
      });
      if (result.upsertedCount > 0) this.invalidateStats();
      return result.upsertedCount;
    } catch (error: unknown) {
      const result = (error as { result?: { upsertedCount?: number } }).result;
      if ((result?.upsertedCount ?? 0) > 0) this.invalidateStats();
      // 并发 upsert 可能撞上另一写入者刚插入的唯一键。仅忽略这些竞争错误。
      const writeErrors = (error as { writeErrors?: Array<{ code: number }> })
        ?.writeErrors;
      if (
        writeErrors?.length &&
        writeErrors.every((item) => item.code === 11000)
      ) {
        return result?.upsertedCount ?? 0;
      }
      this.logger.error(`Failed to save items for source ${source}:`, error);
      throw error;
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
      if (keyword.length > 100) {
        throw new Error('keyword must be at most 100 characters');
      }
      const literalKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 将用户输入作为普通文本匹配，避免正则语法错误和模式注入。
      query.$or = [
        { title: { $regex: literalKeyword, $options: 'i' } },
        { desc: { $regex: literalKeyword, $options: 'i' } },
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
  async getStats(): Promise<HistoryStats> {
    if (this.statsCache && this.statsCache.expiresAt > Date.now()) {
      return this.statsCache.value;
    }
    if (this.statsInFlight !== undefined) return this.statsInFlight;

    const version = this.statsVersion;
    const pending = this.loadStats();
    this.statsInFlight = pending;
    try {
      const stats = await pending;
      if (version === this.statsVersion) {
        this.statsCache = { value: stats, expiresAt: Date.now() + 30_000 };
      }
      return stats;
    } finally {
      if (this.statsInFlight === pending) this.statsInFlight = undefined;
    }
  }

  private invalidateStats(): void {
    this.statsVersion++;
    this.statsCache = undefined;
    this.statsInFlight = undefined;
  }

  private async loadStats(): Promise<HistoryStats> {
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
