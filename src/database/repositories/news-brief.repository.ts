import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NewsBrief,
  NewsBriefDocument,
  NewsBriefItemDocument,
} from '../schemas/news-brief.schema';
import type { NewsBriefStatus } from '../../news-brief/interfaces/news-brief.interface';

export type NewsBriefLean = NewsBrief & { _id?: unknown };

export interface NewsBriefInputWindowData {
  start: Date;
  end: Date;
  lookbackHours: number;
}

export interface ClaimNewsBriefData {
  briefDate: string;
  period: string;
  category: string;
  categoryName: string;
  sources: string[];
  inputWindow: NewsBriefInputWindowData;
  model?: string;
  generationId: string;
  staleBefore: Date;
}

export interface MarkNewsBriefSuccessData {
  title: string;
  summary: string;
  highlights: string[];
  items: NewsBriefItemDocument[];
  sources: string[];
  inputWindow: NewsBriefInputWindowData;
  rawInputItems: Record<string, unknown>[];
  searchEvidence: Record<string, unknown>[];
  model?: string;
  searchProvidersUsed: string[];
}

export interface MarkNewsBriefFailedResult {
  /** 是否保留了此前成功的旧简报（force 重生成失败时）。 */
  retained: boolean;
  brief: NewsBriefLean | null;
}

export interface NewsBriefListOptions {
  page?: number;
  limit?: number;
  category?: string;
  status?: NewsBriefStatus;
  period?: string;
}

export interface NewsBriefListItem {
  briefDate: string;
  period: string;
  category: string;
  categoryName: string;
  status: NewsBriefStatus;
  title?: string;
  summary?: string;
  itemCount: number;
  updatedAt?: Date;
}

export interface NewsBriefListResult {
  data: NewsBriefListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DeleteNewsBriefResult {
  deletedCount?: number;
}

@Injectable()
export class NewsBriefRepository {
  private readonly publicProjection = {
    rawInputItems: 0,
    searchEvidence: 0,
    generationId: 0,
    generationHeartbeatAt: 0,
  };

  constructor(
    @InjectModel(NewsBrief.name)
    private readonly newsBriefModel: Model<NewsBriefDocument>,
  ) {}

  async findByDate(
    briefDate: string,
    period: string,
    category: string,
    includeDebug = false,
  ): Promise<NewsBriefLean | null> {
    return this.newsBriefModel
      .findOne(
        { briefDate, period, category },
        includeDebug ? undefined : this.publicProjection,
      )
      .lean();
  }

  async findLatest(
    category: string,
    period?: string,
    includeDebug = false,
  ): Promise<NewsBriefLean | null> {
    const query: Record<string, unknown> = {
      category,
      status: 'success',
    };
    if (period) {
      query.period = period;
    }

    return this.newsBriefModel
      .findOne(query, includeDebug ? undefined : this.publicProjection)
      .sort({ briefDate: -1, createdAt: -1 })
      .lean();
  }

  /**
   * 原子占位：同一天/period/板块只允许一个生成任务。
   * 返回 false 表示已有活动任务（含并发 upsert 撞唯一索引的 11000）。
   * 占位成功且旧记录是 failed 时，顺带把状态复位成 generating 并清除旧 error。
   */
  async claimGeneration(data: ClaimNewsBriefData): Promise<boolean> {
    try {
      const claimed = await this.newsBriefModel
        .findOneAndUpdate(
          {
            briefDate: data.briefDate,
            period: data.period,
            category: data.category,
            $or: [
              { generationId: { $exists: false } },
              { generationId: null },
              { generationHeartbeatAt: { $lt: data.staleBefore } },
            ],
          },
          {
            $set: {
              generationId: data.generationId,
              generationHeartbeatAt: new Date(),
            },
            $setOnInsert: {
              status: 'generating',
              categoryName: data.categoryName,
              sources: data.sources,
              inputWindow: data.inputWindow,
              model: data.model,
              // 数组字段显式初始化：generating/failed 记录也能被公共投影安全返回
              highlights: [],
              items: [],
              searchProvidersUsed: [],
              rawInputItems: [],
              searchEvidence: [],
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true },
        )
        .lean();
      if (claimed?.generationId !== data.generationId) return false;

      // 重新占位一条此前 failed 的记录时，状态必须回到 generating 并清掉上一次
      // 的 error，否则整个生成过程中 /digest 与 /:date 仍然报 failed + 旧错误。
      // status === 'success' 的记录绝不在这里改动：force 重生成失败时要原样保留
      // 旧的成功内容（见 markFailed 的 retained 分支）。
      if (claimed.status === 'failed') {
        await this.newsBriefModel.updateOne(
          {
            briefDate: data.briefDate,
            period: data.period,
            category: data.category,
            generationId: data.generationId,
            status: 'failed',
          },
          { $set: { status: 'generating' }, $unset: { error: 1 } },
        );
      }

      return true;
    } catch (error) {
      // 已有活动生成任务时，带 $or 的 upsert 会撞上唯一索引。
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async heartbeatGeneration(
    briefDate: string,
    period: string,
    category: string,
    generationId: string,
  ): Promise<void> {
    await this.newsBriefModel.updateOne(
      { briefDate, period, category, generationId },
      { $set: { generationHeartbeatAt: new Date() } },
    );
  }

  async markSuccess(
    briefDate: string,
    period: string,
    category: string,
    generationId: string,
    data: MarkNewsBriefSuccessData,
  ): Promise<NewsBriefLean | null> {
    return this.newsBriefModel
      .findOneAndUpdate(
        { briefDate, period, category, generationId },
        {
          $set: {
            ...data,
            status: 'success',
            updatedAt: new Date(),
          },
          $unset: {
            error: 1,
            generationId: 1,
            generationHeartbeatAt: 1,
          },
        },
        { new: true },
      )
      .lean();
  }

  /**
   * 失败处理：
   * - 此前没有成功记录 -> 标记 failed；
   * - 此前已有成功记录（force 重生成失败）-> 保留旧成功内容，只清理生成标记。
   */
  async markFailed(
    briefDate: string,
    period: string,
    category: string,
    generationId: string,
    error: string,
  ): Promise<MarkNewsBriefFailedResult> {
    const previousSuccess = await this.newsBriefModel
      .findOneAndUpdate(
        {
          briefDate,
          period,
          category,
          generationId,
          status: 'success',
        },
        { $unset: { generationId: 1, generationHeartbeatAt: 1 } },
        { new: true },
      )
      .lean();
    if (previousSuccess) {
      return { retained: true, brief: previousSuccess };
    }

    const failed = await this.newsBriefModel
      .findOneAndUpdate(
        { briefDate, period, category, generationId },
        {
          $set: {
            status: 'failed',
            error,
            updatedAt: new Date(),
          },
          $unset: { generationId: 1, generationHeartbeatAt: 1 },
        },
        { new: true },
      )
      .lean();

    return { retained: false, brief: failed };
  }

  /**
   * 分页列表：只返回摘要与 itemCount，用投影把 items/markdown 留在数据库侧。
   * 聚合只用到 MongoDB 6.0 可用算子（mongo-compatibility.spec.ts 覆盖）。
   */
  async list(options: NewsBriefListOptions = {}): Promise<NewsBriefListResult> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const query: Record<string, unknown> = {};

    if (options.category) query.category = options.category;
    if (options.status) query.status = options.status;
    if (options.period) query.period = options.period;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.newsBriefModel.aggregate<NewsBriefListItem>([
        { $match: query },
        { $sort: { briefDate: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            briefDate: 1,
            period: 1,
            category: 1,
            categoryName: 1,
            status: 1,
            title: { $ifNull: ['$title', '$$REMOVE'] },
            summary: { $ifNull: ['$summary', '$$REMOVE'] },
            itemCount: { $size: { $ifNull: ['$items', []] } },
            updatedAt: 1,
          },
        },
      ]),
      this.newsBriefModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async deleteByDate(
    briefDate: string,
    category: string,
    period?: string,
  ): Promise<DeleteNewsBriefResult> {
    const query: Record<string, unknown> = { briefDate, category };
    if (period) {
      query.period = period;
    }

    return this.newsBriefModel.deleteMany(query);
  }

  async deleteBeforeDate(
    beforeDate: string,
    category?: string,
  ): Promise<DeleteNewsBriefResult> {
    const query: Record<string, unknown> = {
      briefDate: { $lt: beforeDate },
    };
    if (category) {
      query.category = category;
    }

    return this.newsBriefModel.deleteMany(query);
  }
}
