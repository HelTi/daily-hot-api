import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
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

export interface StockRankingOptions {
  period?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface StockRankingItem {
  company: string;
  code: string | null;
  appearanceCount: number;
  briefCount: number;
  firstAppearedDate: string;
  lastAppearedDate: string;
}

interface StockRankingAggregationResult {
  briefs: Array<{ totalBriefs: number }>;
  summary: Array<{ uniqueStocks: number; totalAppearances: number }>;
  rankings: Array<{
    company: string;
    code?: string;
    appearanceCount: number;
    briefIds: unknown[];
    firstAppearedDate: string;
    lastAppearedDate: string;
  }>;
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

  async getStockRanking(options: StockRankingOptions = {}) {
    const match: Record<string, unknown> = { status: 'success' };
    if (options.period) {
      match.period = options.period;
    }
    if (options.startDate || options.endDate) {
      const briefDate: Record<string, string> = {};
      if (options.startDate) {
        briefDate.$gte = options.startDate;
      }
      if (options.endDate) {
        briefDate.$lte = options.endDate;
      }
      match.briefDate = briefDate;
    }

    const stockOccurrences: PipelineStage.FacetPipelineStage[] = [
      {
        $project: {
          briefId: '$_id',
          briefDate: 1,
          topics: {
            $cond: [{ $isArray: '$analysis.topics' }, '$analysis.topics', []],
          },
        },
      },
      { $unwind: '$topics' },
      {
        $project: {
          briefId: 1,
          briefDate: 1,
          mappings: {
            $cond: [
              { $isArray: '$topics.aShareMapping' },
              '$topics.aShareMapping',
              [],
            ],
          },
        },
      },
      { $unwind: '$mappings' },
      {
        $set: {
          company: {
            $trim: {
              input: {
                $convert: {
                  input: '$mappings.company',
                  to: 'string',
                  onError: '',
                  onNull: '',
                },
              },
            },
          },
          code: {
            $toUpper: {
              $replaceAll: {
                input: {
                  $trim: {
                    input: {
                      $convert: {
                        input: '$mappings.code',
                        to: 'string',
                        onError: '',
                        onNull: '',
                      },
                    },
                  },
                },
                find: ' ',
                replacement: '',
              },
            },
          },
        },
      },
      {
        $set: {
          identity: {
            $cond: [
              {
                $not: [{ $in: ['$code', ['', '待验证', '未知', 'N/A', '-']] }],
              },
              { $concat: ['code:', '$code'] },
              {
                $cond: [
                  {
                    $not: [
                      {
                        $in: ['$company', ['', '待验证', '未知', 'N/A', '-']],
                      },
                    ],
                  },
                  { $concat: ['company:', '$company'] },
                  '',
                ],
              },
            ],
          },
        },
      },
      { $match: { identity: { $ne: '' } } },
    ];
    const groupedStocks: PipelineStage.FacetPipelineStage[] = [
      ...stockOccurrences,
      {
        $group: {
          _id: '$identity',
          company: { $last: '$company' },
          code: { $last: '$code' },
          appearanceCount: { $sum: 1 },
          briefIds: { $addToSet: '$briefId' },
          firstAppearedDate: { $min: '$briefDate' },
          lastAppearedDate: { $max: '$briefDate' },
        },
      },
    ];
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    const [result] =
      await this.dailyBriefModel.aggregate<StockRankingAggregationResult>([
        { $match: match },
        { $sort: { briefDate: 1, createdAt: 1 } },
        {
          $facet: {
            briefs: [{ $count: 'totalBriefs' }],
            summary: [
              ...groupedStocks,
              {
                $group: {
                  _id: null,
                  uniqueStocks: { $sum: 1 },
                  totalAppearances: { $sum: '$appearanceCount' },
                },
              },
              { $project: { _id: 0, uniqueStocks: 1, totalAppearances: 1 } },
            ],
            rankings: [
              ...groupedStocks,
              {
                $set: {
                  briefCount: { $size: '$briefIds' },
                },
              },
              {
                $sort: {
                  appearanceCount: -1,
                  briefCount: -1,
                  lastAppearedDate: -1,
                  code: 1,
                  company: 1,
                },
              },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  company: 1,
                  code: 1,
                  appearanceCount: 1,
                  briefIds: 1,
                  firstAppearedDate: 1,
                  lastAppearedDate: 1,
                },
              },
            ],
          },
        },
      ]);

    const summary = result?.summary[0];
    const invalidNames = new Set(['', '待验证', '未知', 'N/A', '-']);
    return {
      totalBriefs: result?.briefs[0]?.totalBriefs || 0,
      uniqueStocks: summary?.uniqueStocks || 0,
      totalAppearances: summary?.totalAppearances || 0,
      rankings: (result?.rankings || []).map(
        (item): StockRankingItem => ({
          company: invalidNames.has(item.company)
            ? item.code || ''
            : item.company,
          code: item.code || null,
          appearanceCount: item.appearanceCount,
          briefCount: item.briefIds.length,
          firstAppearedDate: item.firstAppearedDate,
          lastAppearedDate: item.lastAppearedDate,
        }),
      ),
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
