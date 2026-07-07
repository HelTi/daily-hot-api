import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DailyBrief, DailyBriefDocument } from '../schemas/daily-brief.schema';

export interface DailyBriefListOptions {
  page?: number;
  limit?: number;
  status?: 'generating' | 'success' | 'failed';
  period?: string;
  includeDebug?: boolean;
}

interface DeleteBriefResult {
  deletedCount?: number;
}

@Injectable()
export class DailyBriefRepository {
  private readonly publicProjection = {
    rawInputItems: 0,
    searchEvidence: 0,
  };

  constructor(
    @InjectModel(DailyBrief.name)
    private readonly dailyBriefModel: Model<DailyBriefDocument>,
  ) {}

  async findByDate(briefDate: string, period = 'daily', includeDebug = false) {
    return this.dailyBriefModel
      .findOne(
        { briefDate, period },
        includeDebug ? undefined : this.publicProjection,
      )
      .lean();
  }

  async findLatest(period?: string, includeDebug = false) {
    const query: Record<string, unknown> = { status: 'success' };
    if (period) {
      query.period = period;
    }

    return this.dailyBriefModel
      .findOne(query, includeDebug ? undefined : this.publicProjection)
      .sort({ briefDate: -1, createdAt: -1 })
      .lean();
  }

  async list(options: DailyBriefListOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const { status, period, includeDebug } = options;
    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }
    if (period) {
      query.period = period;
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.dailyBriefModel
        .find(query, includeDebug ? undefined : this.publicProjection)
        .sort({ briefDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.dailyBriefModel.countDocuments(query),
    ]);

    // 返回的数据处理
    const resData = data.map((item) => {
      const topics = item.analysis?.topics;

      return {
        status: item.status,
        briefDate: item.briefDate,
        period: item.period,
        analysis: {
          summary: item.analysis?.summary,
        },
        topicCount: Array.isArray(topics) ? topics.length : undefined,
        updatedAt: item.updatedAt,
      };
    });

    return {
      data: resData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async upsertGenerating(data: {
    briefDate: string;
    period: string;
    sources: string[];
    inputWindow: { start: Date; end: Date; lookbackHours: number };
    model?: string;
  }) {
    return this.dailyBriefModel
      .findOneAndUpdate(
        { briefDate: data.briefDate, period: data.period },
        {
          $set: {
            ...data,
            status: 'generating',
            error: undefined,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true },
      )
      .lean();
  }

  async markSuccess(
    briefDate: string,
    period: string,
    data: {
      analysis: Record<string, unknown>;
      markdown: string;
      rawInputItems: Record<string, unknown>[];
      searchEvidence: Record<string, unknown>[];
      model?: string;
      tavilyUsed: boolean;
    },
  ) {
    return this.dailyBriefModel
      .findOneAndUpdate(
        { briefDate, period },
        {
          $set: {
            ...data,
            status: 'success',
            error: undefined,
            updatedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
  }

  async markFailed(briefDate: string, period: string, error: string) {
    return this.dailyBriefModel
      .findOneAndUpdate(
        { briefDate, period },
        {
          $set: {
            status: 'failed',
            error,
            updatedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
  }

  async deleteByDate(
    briefDate: string,
    period?: string,
  ): Promise<DeleteBriefResult> {
    const query: Record<string, unknown> = { briefDate };
    if (period) {
      query.period = period;
    }

    return this.dailyBriefModel.deleteMany(query);
  }

  async deleteBeforeDate(
    beforeDate: string,
    period?: string,
  ): Promise<DeleteBriefResult> {
    const query: Record<string, unknown> = {
      briefDate: { $lt: beforeDate },
    };
    if (period) {
      query.period = period;
    }

    return this.dailyBriefModel.deleteMany(query);
  }
}
