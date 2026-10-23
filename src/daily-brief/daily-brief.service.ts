import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CacheData, CacheService } from '../cache/cache.service';
import {
  DailyBriefRepository,
  StockRankingItem,
} from '../database/repositories/daily-brief.repository';
import { HotItemRepository } from '../database/repositories/hot-item.repository';
import { FetchHotDataTask } from '../scheduler/tasks/fetch-hot-data.task';
import { AiAnalysisClient, PROMPT_BUDGET } from './clients/ai-analysis.client';
import { TavilySearchClient } from './clients/tavily-search.client';
import {
  BriefInputItem,
  BriefSearchEvidence,
  BriefSearchResult,
  GenerateBriefOptions,
} from './interfaces/daily-brief.interface';
import { StockRankingQueryDto } from './dto/stock-ranking-query.dto';
import { mapWithConcurrency } from './utils/concurrency';
import { endOfBriefDate, formatBriefDate } from './utils/brief-date';
import { DailyBriefConfigService } from './daily-brief.config';
import { createHash, randomUUID } from 'crypto';

const STOCK_RANKING_CACHE_PREFIX = 'daily-brief:statistics:stocks:';

export interface StockRankingResponse {
  filters: {
    period: string | null;
    startDate: string | null;
    endDate: string | null;
    limit: number;
  };
  summary: {
    briefCount: number;
    uniqueStockCount: number;
    totalAppearances: number;
  };
  rankings: Array<StockRankingItem & { rank: number }>;
}

@Injectable()
export class DailyBriefService {
  private readonly logger = new Logger(DailyBriefService.name);

  constructor(
    private readonly config: DailyBriefConfigService,
    private readonly dailyBriefRepository: DailyBriefRepository,
    private readonly hotItemRepository: HotItemRepository,
    private readonly fetchHotDataTask: FetchHotDataTask,
    private readonly aiAnalysisClient: AiAnalysisClient,
    private readonly tavilySearchClient: TavilySearchClient,
    private readonly cacheService: CacheService,
  ) {}

  async generateBrief(options: GenerateBriefOptions = {}) {
    const period = options.period || 'daily';
    const briefDate = options.date || this.formatDate(new Date());
    const sources = this.resolveSources(options.sources);
    const inputWindow = this.resolveInputWindow(
      briefDate,
      this.config.lookbackHours,
    );

    if (!options.force) {
      const existing = await this.dailyBriefRepository.findByDate(
        briefDate,
        period,
      );
      if (existing?.status === 'success') return existing;
    }

    const generationId = randomUUID();
    const timeoutMs = this.config.generatingTimeoutMinutes * 60_000;
    const claimed = await this.dailyBriefRepository.claimGeneration({
      briefDate,
      period,
      sources,
      inputWindow,
      model: this.aiAnalysisClient.getModel(),
      generationId,
      staleBefore: new Date(Date.now() - timeoutMs),
    });
    if (!claimed) {
      throw new BadRequestException(
        `A daily brief is already being generated for ${briefDate}/${period}`,
      );
    }

    const heartbeat = setInterval(
      () => {
        void this.dailyBriefRepository
          .heartbeatGeneration(briefDate, period, generationId)
          .catch((error: unknown) =>
            this.logger.warn('Brief heartbeat failed', error),
          );
      },
      Math.min(60_000, Math.max(1_000, Math.floor(timeoutMs / 3))),
    );

    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        this.generateClaimedBrief(
          briefDate,
          period,
          generationId,
          sources,
          inputWindow,
        ),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Daily brief generation timed out')),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await this.dailyBriefRepository.markFailed(
          briefDate,
          period,
          generationId,
          message,
        );
      } catch (markError) {
        this.logger.error(
          'Failed to record brief generation failure',
          markError,
        );
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
    }
  }

  private async generateClaimedBrief(
    briefDate: string,
    period: string,
    generationId: string,
    sources: string[],
    inputWindow: { start: Date; end: Date; lookbackHours: number },
  ) {
    const fetchedItems = await this.fetchLatestSourceItems(sources);
    const historyItems = await this.loadHistoryItems(
      sources,
      inputWindow.start.getTime(),
      inputWindow.end.getTime(),
    );
    const inputItems = this.mergeAndLimitItems(
      [...fetchedItems, ...historyItems],
      sources.length,
    );

    if (inputItems.length === 0) {
      throw new Error('No hot items available for brief generation');
    }

    const searchEvidence = await this.buildSearchEvidence(inputItems);
    const analysis = await this.aiAnalysisClient.analyzeDailyBrief({
      briefDate,
      sources,
      items: inputItems,
      searchEvidence,
    });

    const brief = await this.dailyBriefRepository.markSuccess(
      briefDate,
      period,
      generationId,
      {
        analysis: analysis as unknown as Record<string, unknown>,
        markdown: analysis.markdown || this.buildFallbackMarkdown(analysis),
        rawInputItems: inputItems as unknown as Record<string, unknown>[],
        searchEvidence: searchEvidence as unknown as Record<string, unknown>[],
        model: this.aiAnalysisClient.getModel(),
        tavilyUsed: searchEvidence.some((item) => item.results.length > 0),
        sources,
        inputWindow,
      },
    );
    if (!brief) throw new Error('Daily brief generation claim was lost');
    await this.invalidateStockRankingCache();

    return this.toPublicBrief(brief);
  }

  findLatest(period?: string, includeDebug = false) {
    return this.dailyBriefRepository.findLatest(period, includeDebug);
  }

  findByDate(date: string, period = 'daily', includeDebug = false) {
    return this.dailyBriefRepository.findByDate(date, period, includeDebug);
  }

  /**
   * 列表只返回摘要字段，因此没有 `includeDebug`：
   * 需要 rawInputItems / searchEvidence 时用 findLatest 或 findByDate。
   */
  list(options: {
    page?: number;
    limit?: number;
    status?: 'generating' | 'success' | 'failed';
    period?: string;
  }) {
    return this.dailyBriefRepository.list(options);
  }

  async getStockRanking(options: StockRankingQueryDto) {
    if (
      options.startDate &&
      options.endDate &&
      options.startDate > options.endDate
    ) {
      throw new BadRequestException(
        'startDate must be earlier than or equal to endDate',
      );
    }

    const filters = {
      period: options.period || null,
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      limit: options.limit || 50,
    };
    const cacheKey = `${STOCK_RANKING_CACHE_PREFIX}${JSON.stringify(filters)}`;
    const cached =
      await this.cacheService.get<CacheData<StockRankingResponse>>(cacheKey);
    if (cached) {
      return cached.data;
    }

    const result = await this.dailyBriefRepository.getStockRanking({
      ...(filters.period ? { period: filters.period } : {}),
      ...(filters.startDate ? { startDate: filters.startDate } : {}),
      ...(filters.endDate ? { endDate: filters.endDate } : {}),
      limit: filters.limit,
    });
    const response: StockRankingResponse = {
      filters,
      summary: {
        briefCount: result.totalBriefs,
        uniqueStockCount: result.uniqueStocks,
        totalAppearances: result.totalAppearances,
      },
      rankings: result.rankings.map((item, index) => ({
        rank: index + 1,
        ...item,
      })),
    };
    await this.cacheService.set(
      cacheKey,
      { data: response, updateTime: new Date().toISOString() },
      this.config.stockRankingCacheTtl,
    );

    return response;
  }

  async deleteByDate(date: string, period?: string) {
    this.validateBriefDate(date);
    const result = await this.dailyBriefRepository.deleteByDate(date, period);
    if ((result.deletedCount || 0) > 0) {
      await this.invalidateStockRankingCache();
    }

    return {
      mode: 'date',
      briefDate: date,
      period: period || null,
      deletedCount: result.deletedCount || 0,
    };
  }

  async deleteHistory(options: {
    olderThan?: string;
    beforeDate?: string;
    period?: string;
  }) {
    if (options.olderThan && options.beforeDate) {
      throw new BadRequestException(
        'Use either olderThan or beforeDate, not both',
      );
    }

    const beforeDate = options.beforeDate
      ? this.validateBriefDate(options.beforeDate)
      : this.resolveOlderThanDate(options.olderThan);

    const result = await this.dailyBriefRepository.deleteBeforeDate(
      beforeDate,
      options.period,
    );
    if ((result.deletedCount || 0) > 0) {
      await this.invalidateStockRankingCache();
    }

    return {
      mode: options.beforeDate ? 'beforeDate' : 'olderThan',
      olderThan: options.olderThan || null,
      beforeDate,
      period: options.period || null,
      deletedCount: result.deletedCount || 0,
    };
  }

  /**
   * 不包含 `enabled`：调度器可以在运行期被 start/stop，
   * 真实状态由 `DailyBriefScheduler.isEnabled()` 提供，在 controller 里合并。
   */
  getConfig() {
    return {
      cronExpression: this.config.cronExpression,
      timezone: this.config.timezone,
      sources: this.resolveSources(),
      lookbackHours: this.config.lookbackHours,
      topItemsPerSource: this.config.topItemsPerSource,
      maxTopics: this.config.maxTopics,
      stockRankingCacheTtl: this.config.stockRankingCacheTtl,
      model: this.aiAnalysisClient.getModel(),
      tavilyConfigured: this.config.tavilyConfigured,
    };
  }

  private invalidateStockRankingCache() {
    return this.cacheService.delByPattern(STOCK_RANKING_CACHE_PREFIX);
  }

  private toPublicBrief<T extends Record<string, unknown> | null>(brief: T): T {
    if (!brief) {
      return brief;
    }

    const { rawInputItems, searchEvidence, ...publicBrief } = brief;
    void rawInputItems;
    void searchEvidence;

    return publicBrief as T;
  }

  private async fetchLatestSourceItems(
    sources: string[],
  ): Promise<BriefInputItem[]> {
    const topItemsPerSource = this.config.topItemsPerSource;

    const results = await mapWithConcurrency(
      sources,
      this.config.sourceConcurrency,
      async (source): Promise<BriefInputItem[]> => {
        try {
          const refreshed = await this.fetchHotDataTask.execute(source);
          if (!refreshed.success || !refreshed.items?.length) {
            // 被调度器禁用、源损坏和源确实没数据是三种情况，日志里必须能区分。
            this.logger.warn(
              `Brief source ${source} contributed no fresh items: ${
                refreshed.error ?? 'empty result'
              }`,
            );
            return [];
          }

          return refreshed.items.slice(0, topItemsPerSource).map((item) => ({
            source,
            title: item.title,
            desc: item.desc,
            hot: item.hot,
            url: item.url,
            mobileUrl: item.mobileUrl,
            timestamp: item.timestamp,
          }));
        } catch (error) {
          this.logger.warn(
            `Failed to refresh source ${source}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        }
      },
    );

    return results.flat();
  }

  private async loadHistoryItems(
    sources: string[],
    startTime: number,
    endTime: number,
  ): Promise<BriefInputItem[]> {
    const topItemsPerSource = this.config.topItemsPerSource;
    const results = await Promise.all(
      sources.map(async (source) => {
        const items = await this.hotItemRepository.getDataByTimeRange(
          source,
          startTime,
          endTime,
        );

        if (!Array.isArray(items)) {
          return [];
        }

        return items.slice(0, topItemsPerSource).map((item) => ({
          source,
          title: item.title,
          desc: item.desc,
          hot: item.hot,
          url: item.url,
          mobileUrl: item.mobileUrl,
          timestamp: item.timestamp,
        }));
      }),
    );

    return results.flat();
  }

  private mergeAndLimitItems(items: BriefInputItem[], sourceCount: number) {
    const seen = new Set<string>();
    const bySource = new Map<string, BriefInputItem[]>();

    for (const item of items) {
      if (!item.title || !item.url) {
        continue;
      }
      const key = `${item.source}:${item.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const sourceItems = bySource.get(item.source) ?? [];
      sourceItems.push(item);
      bySource.set(item.source, sourceItems);
    }

    for (const sourceItems of bySource.values()) {
      sourceItems.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
      });
    }

    // 每个来源先取自身前 N 条，再按轮次交错，防止一个来源占满提示词。
    const result: BriefInputItem[] = [];
    for (let rank = 0; rank < this.config.topItemsPerSource; rank++) {
      for (const sourceItems of bySource.values()) {
        if (sourceItems[rank]) result.push(sourceItems[rank]);
      }
    }
    return result.slice(
      0,
      Math.max(1, sourceCount) * this.config.topItemsPerSource,
    );
  }

  private async buildSearchEvidence(
    items: BriefInputItem[],
  ): Promise<BriefSearchEvidence[]> {
    const seenTitles = new Set<string>();
    const candidates = items
      .filter((item) => {
        const title = item.title
          .toLocaleLowerCase()
          .replace(/[\s\p{P}\p{S}]+/gu, '');
        if (!title || seenTitles.has(title)) return false;
        seenTitles.add(title);
        return true;
      })
      .slice(0, Math.min(this.config.maxTopics, PROMPT_BUDGET.maxTopics));

    return mapWithConcurrency(
      candidates,
      this.config.searchConcurrency,
      async (item) => {
        const query = `${item.title} ${(item.desc || '').slice(0, 120)} 产业链 A股 影响`;
        const key = `daily-brief:search:${createHash('sha256').update(query).digest('hex')}`;
        const cached =
          await this.cacheService.get<CacheData<BriefSearchResult[]>>(key);
        const results =
          cached?.data ?? (await this.tavilySearchClient.search(query));
        if (!cached && results.length > 0) {
          await this.cacheService.set(
            key,
            { data: results, updateTime: new Date().toISOString() },
            3600,
          );
        }
        return {
          topicTitle: item.title,
          query,
          results,
        };
      },
    );
  }

  private resolveSources(sources?: string[]) {
    const configuredSources =
      sources && sources.length > 0 ? sources : this.config.sources;

    return configuredSources.filter(Boolean);
  }

  private resolveInputWindow(briefDate: string, lookbackHours: number) {
    const now = new Date();
    const today = this.formatDate(now);
    const end =
      briefDate === today
        ? now
        : endOfBriefDate(briefDate, this.config.timezone);
    const start = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);

    return {
      start,
      end,
      lookbackHours,
    };
  }

  private formatDate(date: Date) {
    return formatBriefDate(date, this.config.timezone);
  }

  private validateBriefDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Date must be in YYYY-MM-DD format');
    }

    return date;
  }

  private resolveOlderThanDate(olderThan?: string) {
    if (!olderThan) {
      throw new BadRequestException('olderThan or beforeDate is required');
    }

    const normalized = olderThan.trim().toLowerCase();
    const aliases: Record<string, string> = {
      month: '1m',
      'one-month': '1m',
      year: '1y',
      'one-year': '1y',
    };
    const value = aliases[normalized] || normalized;
    const match = value.match(
      /^(\d+)(d|day|days|m|month|months|y|year|years)$/,
    );

    if (!match) {
      throw new BadRequestException(
        'olderThan must use a value like 30d, 1m, or 1y',
      );
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const cutoff = new Date();

    if (unit.startsWith('d')) {
      cutoff.setDate(cutoff.getDate() - amount);
    } else if (unit.startsWith('m')) {
      cutoff.setMonth(cutoff.getMonth() - amount);
    } else {
      cutoff.setFullYear(cutoff.getFullYear() - amount);
    }

    return this.formatDate(cutoff);
  }

  private buildFallbackMarkdown(analysis: { summary: string }) {
    return `# 每日简报\n\n${analysis.summary || ''}`;
  }
}
