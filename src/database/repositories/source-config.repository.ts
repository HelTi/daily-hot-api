import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SourceConfig,
  SourceConfigDocument,
} from '../schemas/source-config.schema';

@Injectable()
export class SourceConfigRepository {
  private readonly logger = new Logger(SourceConfigRepository.name);

  constructor(
    @InjectModel(SourceConfig.name)
    private sourceConfigModel: Model<SourceConfigDocument>,
  ) {}

  // 获取所有配置
  async findAll(): Promise<SourceConfig[]> {
    return this.sourceConfigModel.find().sort({ source: 1 }).lean();
  }

  // 根据数据源名称获取配置
  async findBySource(source: string): Promise<SourceConfig | null> {
    return this.sourceConfigModel.findOne({ source }).lean();
  }

  // 获取启用的数据源配置
  async findEnabled(): Promise<SourceConfig[]> {
    return this.sourceConfigModel.find({ enabled: true }).lean();
  }

  // 创建或更新配置
  async upsert(
    source: string,
    config: Partial<SourceConfig>,
  ): Promise<SourceConfig> {
    return this.sourceConfigModel.findOneAndUpdate(
      { source },
      { ...config, source },
      { upsert: true, new: true },
    );
  }

  // 更新最后抓取时间
  async updateLastFetchTime(source: string): Promise<void> {
    await this.sourceConfigModel.updateOne(
      { source },
      { lastFetchAt: new Date() },
    );
  }

  // 批量初始化配置
  async initializeConfigs(sources: string[]): Promise<void> {
    this.logger.debug(`Initializing configs for ${sources.length} sources`);

    // 获取已存在的配置
    const existingConfigs = await this.sourceConfigModel.find({
      source: { $in: sources },
    });
    const existingSourceNames = new Set(
      existingConfigs.map((config) => config.source),
    );

    // 只初始化不存在的配置
    const newConfigs = sources
      .filter((source) => !existingSourceNames.has(source))
      .map((source) => ({
        source,
        enabled: true,
        interval: 30, // 默认30分钟
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    if (newConfigs.length > 0) {
      await this.sourceConfigModel.insertMany(newConfigs);
      this.logger.log(`Initialized ${newConfigs.length} new source configs`);
    } else {
      this.logger.debug(
        'All source configs already exist, no initialization needed',
      );
    }
  }

  // 启用/禁用数据源
  async setEnabled(source: string, enabled: boolean): Promise<void> {
    await this.sourceConfigModel.updateOne(
      { source },
      { enabled, updatedAt: new Date() },
    );
  }

  // 更新抓取间隔
  async updateInterval(source: string, interval: number): Promise<void> {
    await this.sourceConfigModel.updateOne(
      { source },
      { interval, updatedAt: new Date() },
    );
  }
}
