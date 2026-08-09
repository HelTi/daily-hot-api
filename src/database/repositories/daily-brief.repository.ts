import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { DailyBrief, DailyBriefDocument } from '../schemas/daily-brief.schema';

/** AI 可能给出的占位值，等同于「没有填」。 */
const INVALID_VALUES = ['', '待验证', '未知', 'N/A', '-'];

/** A 股代码可能带的交易所前缀。 */
const MARKET_PREFIXES = ['SH', 'SZ', 'BJ'];

/**
 * 取数组里最后一个非 null 的值，没有则返回空字符串。
 * 上游按 briefDate 升序排过，所以「最后一个」就是最近一次出现的值。
 */
const lastValidValue = (field: string) => ({
  $let: {
    vars: {
      valid: {
        $filter: {
          input: field,
          // 两轮分组分别会塞进 null 和空串，这里一并过滤
          cond: { $not: [{ $in: ['$$this', [null, ...INVALID_VALUES]] }] },
        },
      },
    },
    in: { $ifNull: [{ $arrayElemAt: ['$$valid', -1] }, ''] },
  },
});

export interface DailyBriefListOptions {
  page?: number;
  limit?: number;
  status?: 'generating' | 'success' | 'failed';
  period?: string;
}

export interface DailyBriefListItem {
  status: 'generating' | 'success' | 'failed';
  briefDate: string;
  period: string;
  analysis: { summary?: string };
  topicCount?: number;
  updatedAt?: Date;
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
  summary: Array<{ uniqueStocks: number; totalAppearances: number }>;
  rankings: Array<{
    company: string;
    code?: string;
    appearanceCount: number;
    briefCount: number;
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
    const { status, period } = options;
    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }
    if (period) {
      query.period = period;
    }

    const skip = (page - 1) * limit;
    // 列表只需要摘要和主题数量，用投影把 analysis.topics / markdown 留在数据库侧，
    // 避免为了算一个 length 就把整份简报读出来。
    const [data, total] = await Promise.all([
      this.dailyBriefModel.aggregate<DailyBriefListItem>([
        { $match: query },
        { $sort: { briefDate: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            status: 1,
            briefDate: 1,
            period: 1,
            analysis: {
              summary: { $ifNull: ['$analysis.summary', '$$REMOVE'] },
            },
            topicCount: {
              $cond: [
                { $isArray: '$analysis.topics' },
                { $size: '$analysis.topics' },
                '$$REMOVE',
              ],
            },
            updatedAt: 1,
          },
        },
      ]),
      this.dailyBriefModel.countDocuments(query),
    ]);

    return {
      data,
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

    const stockOccurrences: PipelineStage[] = [
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
        $addFields: {
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
              $reduce: {
                input: {
                  $split: [
                    {
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
                    ' ',
                  ],
                },
                initialValue: '',
                in: { $concat: ['$$value', '$$this'] },
              },
            },
          },
        },
      },
      // 归一化股票代码：去掉 `.SH` 之类的后缀和 `SH`/`SZ`/`BJ` 前缀，
      // 让 600519 / SH600519 / 600519.SH 归到同一只股票。
      // MongoDB 4.0 没有 $regexFind，这里只用字符串切分实现。
      {
        $addFields: {
          code: {
            $let: {
              vars: {
                base: { $arrayElemAt: [{ $split: ['$code', '.'] }, 0] },
              },
              in: {
                $let: {
                  vars: {
                    prefix: { $substrCP: ['$$base', 0, 2] },
                    rest: {
                      $substrCP: ['$$base', 2, { $strLenCP: '$$base' }],
                    },
                  },
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $in: ['$$prefix', MARKET_PREFIXES] },
                          { $eq: [{ $strLenCP: '$$rest' }, 6] },
                        ],
                      },
                      '$$rest',
                      '$$base',
                    ],
                  },
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          hasValidCompany: { $not: [{ $in: ['$company', INVALID_VALUES] }] },
          hasValidCode: { $not: [{ $in: ['$code', INVALID_VALUES] }] },
        },
      },
      {
        // 先按公司名归并：同一家公司在不同简报里可能有时带代码、有时不带，
        // 只有先聚到一起才能把「有代码」的那次学到的代码补给「没代码」的那些。
        $addFields: {
          groupKey: {
            $cond: [
              '$hasValidCompany',
              { $concat: ['company:', '$company'] },
              {
                $cond: ['$hasValidCode', { $concat: ['code:', '$code'] }, ''],
              },
            ],
          },
        },
      },
      { $match: { groupKey: { $ne: '' } } },
    ];
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    // 分组只跑一遍：summary 和 rankings 从同一份聚合结果分叉，
    // 简报总数用一次 countDocuments 并行取，不必为它保留原始文档。
    const [[result], totalBriefs] = await Promise.all([
      this.dailyBriefModel.aggregate<StockRankingAggregationResult>([
        { $match: match },
        // $last 依赖这个顺序来取每只股票最新出现时的名称和代码
        { $sort: { briefDate: 1, createdAt: 1 } },
        ...stockOccurrences,
        // 第一轮：按公司名（无公司名时按代码）聚合，顺带收集出现过的代码和名称
        {
          $group: {
            _id: '$groupKey',
            companies: {
              $push: { $cond: ['$hasValidCompany', '$company', null] },
            },
            codes: { $push: { $cond: ['$hasValidCode', '$code', null] } },
            appearanceCount: { $sum: 1 },
            briefIds: { $addToSet: '$briefId' },
            firstAppearedDate: { $min: '$briefDate' },
            lastAppearedDate: { $max: '$briefDate' },
          },
        },
        {
          // 取最近一次出现时的有效代码/名称（上游已按 briefDate 升序排过）
          $addFields: {
            company: lastValidValue('$companies'),
            resolvedCode: lastValidValue('$codes'),
          },
        },
        {
          // 学到代码的公司改用代码作为身份，于是「有代码」和「没代码」的
          // 同一家公司、以及只有代码没有名称的记录，都会并到同一条上。
          $addFields: {
            identity: {
              $cond: [
                { $eq: ['$resolvedCode', ''] },
                '$_id',
                { $concat: ['code:', '$resolvedCode'] },
              ],
            },
          },
        },
        { $sort: { lastAppearedDate: 1 } },
        // 第二轮：把归并到同一身份的分组合并成最终结果
        {
          $group: {
            _id: '$identity',
            companies: { $push: '$company' },
            code: { $last: '$resolvedCode' },
            appearanceCount: { $sum: '$appearanceCount' },
            briefIdGroups: { $push: '$briefIds' },
            firstAppearedDate: { $min: '$firstAppearedDate' },
            lastAppearedDate: { $max: '$lastAppearedDate' },
          },
        },
        {
          $addFields: {
            company: lastValidValue('$companies'),
            // 跨分组去重后才是真实的简报数
            briefCount: {
              $size: {
                $reduce: {
                  input: '$briefIdGroups',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
          },
        },
        // 中间字段只用于计算，尽早丢弃避免传输大量 ObjectId
        {
          $project: {
            briefIdGroups: 0,
            briefIds: 0,
            companies: 0,
            codes: 0,
            resolvedCode: 0,
          },
        },
        {
          $facet: {
            summary: [
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
                  briefCount: 1,
                  firstAppearedDate: 1,
                  lastAppearedDate: 1,
                },
              },
            ],
          },
        },
      ]),
      this.dailyBriefModel.countDocuments(match),
    ]);

    const summary = result?.summary[0];
    const invalidNames = new Set(INVALID_VALUES);
    return {
      totalBriefs,
      uniqueStocks: summary?.uniqueStocks || 0,
      totalAppearances: summary?.totalAppearances || 0,
      rankings: (result?.rankings || []).map(
        (item): StockRankingItem => ({
          company: invalidNames.has(item.company)
            ? item.code || ''
            : item.company,
          code: item.code || null,
          appearanceCount: item.appearanceCount,
          briefCount: item.briefCount,
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
