import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { CacheData, CacheService } from '../cache/cache.service';
import { HotListsService } from '../host-lists/hot-lists.service';
import { HotItemRepository } from '../database/repositories/hot-item.repository';
import {
  NewsBriefLean,
  NewsBriefRepository,
} from '../database/repositories/news-brief.repository';
import { FetchHotDataTask } from '../scheduler/tasks/fetch-hot-data.task';
import {
  GenerateNewsBriefOptions,
  ListNewsBriefsOptions,
  NewsBriefDeleteHistoryResponse,
  NewsBriefDeleteResponse,
  NewsBriefDigestResponse,
  NewsBriefGenerateResponse,
  NewsBriefGenerationResult,
  NewsBriefInputItem,
  NewsBriefListResponse,
  NewsBriefPublicConfig,
  NewsBriefResponse,
  NewsBriefSearchEvidence,
  NewsCategoryProfile,
  NewsCategorySummary,
} from './interfaces/news-brief.interface';
import { getNewsCategoryProfile } from './categories/news-category.registry';
import {
  NewsBriefAiClient,
  P0_CONTENT_MAX_CHARS,
  P1_CONTENT_MAX_CHARS,
  PROMPT_BUDGET,
} from './clients/news-brief-ai.client';
import { NewsBriefSearchService } from './clients/news-brief-search.service';
import { NewsBriefConfigService } from './news-brief.config';
import {
  endOfBriefDate,
  formatBriefDate,
} from '../daily-brief/utils/brief-date';
import { mapWithConcurrency } from '../daily-brief/utils/concurrency';
import {
  SearchOutcome,
  SearchProviderName,
} from '../daily-brief/interfaces/search-provider.interface';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SEARCH_CACHE_PREFIX = 'news-brief:search:v1:';
const SEARCH_CACHE_TTL_SECONDS = 3600;

interface SourceItemLike {
  title: string;
  desc?: string;
  hot?: number | string;
  url: string;
  timestamp?: number;
}

/**
 * 单次 generate() 调用内共享的上下文。
 *
 * 板块之间会共用热榜来源（如 weibo/baidu/zhihu/toutiao 同时属于综合新闻与
 * 体育），而刷新走的是 `noCache=true` 的真实上游请求。按来源缓存「在途
 * promise」，同一次运行里每个来源只刷新一次，既少打上游也少写一遍历史库。
 */
interface GenerationRun {
  freshItems: Map<string, Promise<NewsBriefInputItem[]>>;
  sourceNames: Map<string, string>;
}

@Injectable()
export class NewsBriefService {
  private readonly logger = new Logger(NewsBriefService.name);

  constructor(
    private readonly config: NewsBriefConfigService,
    private readonly newsBriefRepository: NewsBriefRepository,
    private readonly hotItemRepository: HotItemRepository,
    private readonly fetchHotDataTask: FetchHotDataTask,
    private readonly hotListsService: HotListsService,
    private readonly aiClient: NewsBriefAiClient,
    private readonly searchService: NewsBriefSearchService,
    private readonly cacheService: CacheService,
  ) {}

  /** 生成一个板块或全部启用板块。始终返回 results[]，部分成功也能表达。 */
  async generate(
    options: GenerateNewsBriefOptions = {},
  ): Promise<NewsBriefGenerateResponse> {
    const period = this.normalizePeriod(options.period);
    const briefDate = this.resolveBriefDate(options.date);
    const profiles = this.resolveGenerateProfiles(options.category);
    const sourcesOverride = this.resolveSourcesOverride(options);

    const run: GenerationRun = {
      freshItems: new Map(),
      sourceNames: this.buildSourceNameMap(),
    };

    const results = await mapWithConcurrency(
      profiles,
      this.config.categoryConcurrency,
      // 兜底：generateForCategory 内部的 claim 之前/之后都可能抛（Mongo 抖动），
      // 不接住就会让整个请求 500 并丢掉其他板块已经生成好的结果。
      // 契约是「每个板块都有一条 result」，这里保证它成立。
      (profile) =>
        this.generateForCategory(profile, {
          briefDate,
          period,
          force: Boolean(options.force),
          sourcesOverride,
          run,
        }).catch((error: unknown): NewsBriefGenerationResult => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `[NewsBrief] ${profile.code} generation aborted: ${message}`,
          );
          return {
            category: profile.code,
            categoryName: profile.name,
            status: 'failed',
            error: message,
          };
        }),
    );

    return { briefDate, period, results };
  }

  /** 指定板块最新成功简报；category 必填。 */
  async findLatest(
    category: string | undefined,
    period?: string,
    includeDebug = false,
  ): Promise<NewsBriefResponse | null> {
    const profile = this.requireKnownCategory(category);
    const brief = await this.newsBriefRepository.findLatest(
      profile.code,
      this.normalizePeriod(period),
      includeDebug,
    );

    return brief ? this.toResponse(brief, includeDebug) : null;
  }

  /** 指定日期/板块的简报（可能是 generating / failed）。 */
  async findByDate(
    date: string,
    category: string | undefined,
    period?: string,
    includeDebug = false,
  ): Promise<NewsBriefResponse | null> {
    const profile = this.requireKnownCategory(category);
    const brief = await this.newsBriefRepository.findByDate(
      this.validateDate(date),
      this.normalizePeriod(period),
      profile.code,
      includeDebug,
    );

    return brief ? this.toResponse(brief, includeDebug) : null;
  }

  /**
   * 多板块聚合读取：一次返回指定板块在某个日期的简报（没有记录时 status=missing）。
   * 用 N 次 findOne 并行读取；数据库连接级失败会让整个请求失败（不承诺单板块降级）。
   */
  async findDigest(
    categories?: string | string[],
    date?: string,
    period?: string,
  ): Promise<NewsBriefDigestResponse> {
    const profiles = this.resolveDigestProfiles(categories);
    const briefDate = date
      ? this.validateDate(date)
      : formatBriefDate(new Date(), this.config.timezone);
    const normalizedPeriod = this.normalizePeriod(period);

    const entries = await Promise.all(
      profiles.map(async (profile) => {
        const brief = await this.newsBriefRepository.findByDate(
          briefDate,
          normalizedPeriod,
          profile.code,
        );
        return {
          category: profile.code,
          categoryName: profile.name,
          status: brief ? brief.status : ('missing' as const),
          brief: brief ? this.toResponse(brief) : null,
        };
      }),
    );

    return { briefDate, categories: entries };
  }

  async list(options: ListNewsBriefsOptions): Promise<NewsBriefListResponse> {
    const category = options.category
      ? this.requireKnownCategory(options.category).code
      : undefined;
    const period = this.normalizePeriod(options.period);

    return this.newsBriefRepository.list({
      page: options.page,
      limit: options.limit,
      category,
      status: options.status,
      period,
    });
  }

  async deleteByDate(
    date: string,
    category?: string,
    period?: string,
  ): Promise<NewsBriefDeleteResponse> {
    const briefDate = this.validateDate(date);
    if (!category) {
      throw new BadRequestException(
        'category is required when deleting a news brief date',
      );
    }
    const profile = this.requireKnownCategory(category);
    const normalizedPeriod = this.normalizeOptionalPeriod(period);
    const result = await this.newsBriefRepository.deleteByDate(
      briefDate,
      profile.code,
      normalizedPeriod,
    );

    return {
      mode: 'date',
      briefDate,
      category: profile.code,
      period: normalizedPeriod ?? null,
      deletedCount: result.deletedCount ?? 0,
    };
  }

  async deleteHistory(options: {
    olderThan?: string;
    beforeDate?: string;
    category?: string;
  }): Promise<NewsBriefDeleteHistoryResponse> {
    if (options.olderThan && options.beforeDate) {
      throw new BadRequestException(
        'Use either olderThan or beforeDate, not both',
      );
    }
    const beforeDate = options.beforeDate
      ? this.validateDate(options.beforeDate)
      : this.resolveOlderThanDate(options.olderThan);
    const category = options.category
      ? this.requireKnownCategory(options.category).code
      : undefined;
    const result = await this.newsBriefRepository.deleteBeforeDate(
      beforeDate,
      category,
    );

    return {
      mode: options.beforeDate ? 'beforeDate' : 'olderThan',
      olderThan: options.olderThan || null,
      beforeDate,
      category: category ?? null,
      deletedCount: result.deletedCount ?? 0,
    };
  }

  getConfig(): NewsBriefPublicConfig {
    return {
      cronExpression: this.config.cronExpression,
      timezone: this.config.timezone,
      categories: this.config.categorySummaries,
      lookbackHours: this.config.lookbackHours,
      topItemsPerSource: this.config.topItemsPerSource,
      maxCandidates: this.config.maxCandidates,
      maxItemsPerCategory: this.config.maxItemsPerCategory,
      categoryConcurrency: this.config.categoryConcurrency,
      sourceConcurrency: this.config.sourceConcurrency,
      generatingTimeoutMinutes: this.config.generatingTimeoutMinutes,
      manualGenerateEnabled: this.config.manualGenerateEnabled,
      model: this.aiClient.getModel(),
      searchEnabled: this.config.searchEnabled,
      searchProviders: this.config.searchProviders,
      searchMaxQueries: this.config.searchMaxQueries,
      searchQueryMaxChars: this.config.searchQueryMaxChars,
    };
  }

  getCategories(): NewsCategorySummary[] {
    return this.config.categorySummaries;
  }

  private async generateForCategory(
    profile: NewsCategoryProfile,
    params: {
      briefDate: string;
      period: string;
      force: boolean;
      sourcesOverride?: string[];
      run: GenerationRun;
    },
  ): Promise<NewsBriefGenerationResult> {
    const sources = params.sourcesOverride ?? profile.sources;

    if (!params.force) {
      const existing = await this.newsBriefRepository.findByDate(
        params.briefDate,
        params.period,
        profile.code,
      );
      if (existing?.status === 'success') {
        return {
          category: profile.code,
          categoryName: profile.name,
          status: 'skipped',
          reason: 'already_generated',
          brief: this.toResponse(existing),
        };
      }
    }

    const generationId = randomUUID();
    const timeoutMs = this.config.generatingTimeoutMinutes * 60_000;
    const inputWindow = this.resolveInputWindow(
      params.briefDate,
      this.config.lookbackHours,
    );
    const claimed = await this.newsBriefRepository.claimGeneration({
      briefDate: params.briefDate,
      period: params.period,
      category: profile.code,
      categoryName: profile.name,
      sources,
      inputWindow,
      model: this.aiClient.getModel(),
      generationId,
      staleBefore: new Date(Date.now() - timeoutMs),
    });
    if (!claimed) {
      return {
        category: profile.code,
        categoryName: profile.name,
        status: 'skipped',
        reason: 'generation_in_progress',
      };
    }

    const heartbeat = setInterval(
      () => {
        void this.newsBriefRepository
          .heartbeatGeneration(
            params.briefDate,
            params.period,
            profile.code,
            generationId,
          )
          .catch((error: unknown) =>
            this.logger.warn('News brief heartbeat failed', error),
          );
      },
      Math.min(60_000, Math.max(1_000, Math.floor(timeoutMs / 3))),
    );

    let timeout: NodeJS.Timeout | undefined;

    try {
      this.logger.log(
        `[NewsBrief] generating ${profile.code} for ${params.briefDate}/${params.period}`,
      );
      const promise = this.generateClaimedBrief(
        profile,
        params.briefDate,
        params.period,
        generationId,
        sources,
        inputWindow,
        params.run,
      );
      const timedOut = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('News brief generation timed out')),
          timeoutMs,
        );
      });
      const brief = await Promise.race([promise, timedOut]);
      this.logger.log(
        `[NewsBrief] generated ${profile.code}: ${brief.itemCount} items`,
      );

      return {
        category: profile.code,
        categoryName: profile.name,
        status: 'success',
        brief,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[NewsBrief] failed to generate ${profile.code}: ${message}`,
      );

      let retained: NewsBriefLean | null = null;
      try {
        const failed = await this.newsBriefRepository.markFailed(
          params.briefDate,
          params.period,
          profile.code,
          generationId,
          message,
        );
        if (failed.retained) retained = failed.brief;
      } catch (markError) {
        this.logger.error(
          'Failed to record news brief generation failure',
          markError,
        );
      }

      return {
        category: profile.code,
        categoryName: profile.name,
        status: 'failed',
        error: message,
        ...(retained
          ? {
              previousBriefRetained: true,
              brief: this.toResponse(retained),
            }
          : {}),
      };
    } finally {
      clearInterval(heartbeat);
      if (timeout) clearTimeout(timeout);
    }
  }

  private async generateClaimedBrief(
    profile: NewsCategoryProfile,
    briefDate: string,
    period: string,
    generationId: string,
    sources: string[],
    inputWindow: { start: Date; end: Date; lookbackHours: number },
    run: GenerationRun,
  ): Promise<NewsBriefResponse> {
    const [freshItems, historyItems] = await Promise.all([
      this.fetchLatestSourceItems(sources, run),
      this.loadHistoryItems(
        sources,
        inputWindow.start.getTime(),
        inputWindow.end.getTime(),
        run,
      ),
    ]);
    const inputItems = this.mergeAndLimitItems([
      ...freshItems,
      ...historyItems,
    ]);

    if (inputItems.length === 0) {
      throw new Error('No hot items available for news brief');
    }

    // 搜索是否生效只由配置决定（全局开关 + 板块 profile.search + 密钥），
    // 这样同一份配置下提示词形态稳定，不随单次查询成败漂移。
    const searchActive = this.isSearchActive(profile);
    const searchEvidence = searchActive
      ? await this.buildSearchEvidence(inputItems)
      : [];
    const searchProvidersUsed = [
      ...new Set(
        searchEvidence
          .filter((evidence) => evidence.results.length > 0)
          .map((evidence) => evidence.provider)
          .filter((provider): provider is SearchProviderName => !!provider),
      ),
    ];

    const analysis = await this.aiClient.analyzeNewsBrief({
      category: profile,
      briefDate,
      items: inputItems,
      outputItemCount: this.effectiveMaxItems(profile),
      searchEvidence,
      contentMaxChars: searchActive
        ? P1_CONTENT_MAX_CHARS
        : P0_CONTENT_MAX_CHARS,
    });

    const saved = await this.newsBriefRepository.markSuccess(
      briefDate,
      period,
      profile.code,
      generationId,
      {
        title: analysis.title,
        summary: analysis.summary,
        highlights: analysis.highlights,
        items: analysis.items,
        sources,
        inputWindow,
        rawInputItems: inputItems as unknown as Record<string, unknown>[],
        searchEvidence: searchEvidence as unknown as Record<string, unknown>[],
        model: this.aiClient.getModel(),
        searchProvidersUsed,
      },
    );
    if (!saved) {
      throw new Error('News brief generation claim was lost');
    }

    return this.toResponse(saved);
  }

  private async fetchLatestSourceItems(
    sources: string[],
    run: GenerationRun,
  ): Promise<NewsBriefInputItem[]> {
    const results = await mapWithConcurrency(
      sources,
      this.config.sourceConcurrency,
      (source) => this.refreshSourceOnce(source, run),
    );

    return results.flat();
  }

  /** 同一次 generate() 内每个来源只刷新一次，多个板块共享同一个 promise。 */
  private refreshSourceOnce(
    source: string,
    run: GenerationRun,
  ): Promise<NewsBriefInputItem[]> {
    const pending = run.freshItems.get(source);
    if (pending) return pending;

    const started = this.refreshSource(source, run.sourceNames);
    run.freshItems.set(source, started);
    return started;
  }

  private async refreshSource(
    source: string,
    sourceNames: Map<string, string>,
  ): Promise<NewsBriefInputItem[]> {
    const topItemsPerSource = this.config.topItemsPerSource;

    try {
      const refreshed = await this.fetchHotDataTask.execute(source);
      if (!refreshed.success || !refreshed.items?.length) {
        this.logger.warn(
          `[NewsBrief] source ${source} contributed no fresh items: ${
            refreshed.error ?? 'empty result'
          }`,
        );
        return [];
      }

      return refreshed.items
        .slice(0, topItemsPerSource)
        .map((item) =>
          this.toInputItem(source, sourceNames.get(source) ?? source, item),
        )
        .filter((item): item is NewsBriefInputItem => item !== null);
    } catch (error) {
      this.logger.warn(
        `[NewsBrief] failed to refresh source ${source}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private async loadHistoryItems(
    sources: string[],
    startTime: number,
    endTime: number,
    run: GenerationRun,
  ): Promise<NewsBriefInputItem[]> {
    const sourceNames = run.sourceNames;
    const topItemsPerSource = this.config.topItemsPerSource;

    const results = await Promise.all(
      sources.map(async (source): Promise<NewsBriefInputItem[]> => {
        // limit 下推到 Mongo：否则 24 小时窗口会把该来源的全部文档读进内存
        // 再丢掉，{ source: 1, timestamp: -1 } 索引已覆盖这个排序。
        const items = await this.hotItemRepository.getDataByTimeRange(
          source,
          startTime,
          endTime,
          topItemsPerSource,
        );
        if (!Array.isArray(items)) return [];

        return items
          .slice(0, topItemsPerSource)
          .map((item) =>
            this.toInputItem(source, sourceNames.get(source) ?? source, item),
          )
          .filter((item): item is NewsBriefInputItem => item !== null);
      }),
    );

    return results.flat();
  }

  private buildSourceNameMap(): Map<string, string> {
    return new Map(
      this.hotListsService
        .getAllSourcesWithMetadata()
        .map((item) => [item.name, item.title]),
    );
  }

  private toInputItem(
    source: string,
    sourceName: string,
    item: SourceItemLike,
  ): NewsBriefInputItem | null {
    if (!item.title || !item.url) return null;

    return {
      ref: createHash('sha256')
        .update(`${source}|${item.url}`)
        .digest('hex')
        .slice(0, 8),
      source,
      sourceName,
      title: item.title,
      desc: item.desc,
      hot: item.hot,
      url: item.url,
      timestamp:
        typeof item.timestamp === 'number' ? item.timestamp : undefined,
    };
  }

  /** 按 {source,url} 去重 -> 每源时间倒序 -> 跨源轮次交错 -> 截断候选上限。 */
  private mergeAndLimitItems(
    items: NewsBriefInputItem[],
  ): NewsBriefInputItem[] {
    // 配置读取走 ConfigService，循环里不要反复取。
    const maxCandidates = this.config.maxCandidates;
    const seen = new Set<string>();
    const bySource = new Map<string, NewsBriefInputItem[]>();

    for (const item of items) {
      if (!item.title || !item.url) continue;
      const key = `${item.source}:${item.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sourceItems = bySource.get(item.source) ?? [];
      sourceItems.push(item);
      bySource.set(item.source, sourceItems);
    }

    const buckets = [...bySource.values()];
    for (const sourceItems of buckets) {
      sourceItems.sort((a, b) => this.timestampOf(b) - this.timestampOf(a));
    }

    // 轮次上限按最长的来源桶算，不能用 topItemsPerSource：新鲜抓取与历史各取
    // 前 N 条后，同一来源去重后最多会有 2N 条，用 N 当上限会在还没到
    // maxCandidates 时就白扔掉一半候选（来源很少或大部分来源失败时尤其明显）。
    const maxRank = buckets.reduce(
      (longest, sourceItems) => Math.max(longest, sourceItems.length),
      0,
    );
    const result: NewsBriefInputItem[] = [];
    for (let rank = 0; rank < maxRank; rank++) {
      for (const sourceItems of buckets) {
        const item = sourceItems[rank];
        if (!item) continue;
        result.push(item);
        if (result.length >= maxCandidates) return result;
      }
    }

    return result;
  }

  private timestampOf(item: NewsBriefInputItem): number {
    if (
      typeof item.timestamp !== 'number' ||
      !Number.isFinite(item.timestamp)
    ) {
      return 0;
    }
    return item.timestamp < 1e12 ? item.timestamp * 1000 : item.timestamp;
  }

  private effectiveMaxItems(profile: NewsCategoryProfile): number {
    return Math.min(
      profile.maxItems,
      this.config.maxItemsPerCategory,
      PROMPT_BUDGET.maxOutputItems,
    );
  }

  /**
   * 搜索增强是否对该板块生效：全局开关 + 板块 profile.search + 至少一个平台
   * 配了密钥。三者都满足才会发起检索，也才把 content 目标从 300 放宽到 600；
   * 否则模型会在只有标题/摘要的输入上硬凑长文（见设计文档 R1）。
   */
  private isSearchActive(profile: NewsCategoryProfile): boolean {
    if (!this.config.searchEnabled) return false;
    if (!profile.search) {
      this.logger.log(
        `[NewsBrief] category ${profile.code} opts out of search enhancement`,
      );
      return false;
    }
    if (!this.searchService.isConfigured()) {
      this.logger.warn(
        '[NewsBrief] search enhancement is enabled but no search provider is configured; skipping',
      );
      return false;
    }
    return true;
  }

  /**
   * 为候选新闻补充搜索证据（P1，默认关闭；调用前已过 isSearchActive）。
   * 单个查询失败只降级为空证据，不阻断生成；有结果的查询缓存 1 小时。
   */
  private async buildSearchEvidence(
    inputItems: NewsBriefInputItem[],
  ): Promise<NewsBriefSearchEvidence[]> {
    const seenTitles = new Set<string>();
    const candidates = inputItems
      .filter((item) => {
        const titleKey = item.title
          .toLocaleLowerCase()
          .replace(/[\s\p{P}\p{S}]+/gu, '');
        if (!titleKey || seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
      })
      .slice(
        0,
        Math.min(this.config.searchMaxQueries, PROMPT_BUDGET.maxSearchEvidence),
      );

    return mapWithConcurrency(
      candidates,
      this.config.searchConcurrency,
      async (item): Promise<NewsBriefSearchEvidence> => {
        const query = this.buildSearchQuery(item);
        const cacheKey = `${SEARCH_CACHE_PREFIX}${createHash('sha256')
          .update(`${this.config.searchProviders.join(',')}:${query}`)
          .digest('hex')}`;
        const cached =
          await this.cacheService.get<CacheData<SearchOutcome>>(cacheKey);
        const outcome =
          cached?.data ?? (await this.searchService.search(query));
        if (!cached && outcome.results.length > 0) {
          await this.cacheService.set(
            cacheKey,
            { data: outcome, updateTime: new Date().toISOString() },
            SEARCH_CACHE_TTL_SECONDS,
          );
        }

        return {
          ref: item.ref,
          topicTitle: item.title,
          query,
          provider: outcome.provider,
          results: outcome.results,
        };
      },
    );
  }

  /** 查询词 = 标题 + 描述，按产品要求截断到 NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS（≤2000）。 */
  private buildSearchQuery(item: NewsBriefInputItem): string {
    const base = `${item.title} ${item.desc ?? ''}`
      .replace(/\s+/gu, ' ')
      .trim();
    return base.length > this.config.searchQueryMaxChars
      ? base.slice(0, this.config.searchQueryMaxChars)
      : base;
  }

  private resolveDigestProfiles(
    raw?: string | string[],
  ): NewsCategoryProfile[] {
    if (!raw) return this.config.categories;
    // 重复 query 参数（?categories=a&categories=b）会被 Express 解析成数组，
    // 与逗号分隔等价处理，避免 500。
    const codes = (Array.isArray(raw) ? raw.join(',') : raw)
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    if (codes.length === 0) return this.config.categories;

    const enabled = new Map(
      this.config.categories.map((profile) => [profile.code, profile]),
    );
    return [...new Set(codes)].map((code) => {
      const known = getNewsCategoryProfile(code);
      if (!known) {
        throw new BadRequestException(this.unknownCategoryMessage(code));
      }
      const profile = enabled.get(code);
      if (!profile) {
        throw new BadRequestException(
          `Category "${code}" is not enabled. Enabled: ${[
            ...enabled.keys(),
          ].join(', ')}`,
        );
      }
      return profile;
    });
  }

  private resolveGenerateProfiles(category?: string): NewsCategoryProfile[] {
    const enabled = this.config.categories;
    if (!category) return enabled;

    const profile = enabled.find((item) => item.code === category);
    if (!profile) {
      const known = getNewsCategoryProfile(category);
      throw new BadRequestException(
        known
          ? `Category "${category}" is not enabled. Enabled: ${enabled
              .map((item) => item.code)
              .join(', ')}`
          : this.unknownCategoryMessage(category),
      );
    }

    return [profile];
  }

  private requireKnownCategory(
    category: string | undefined,
  ): NewsCategoryProfile {
    if (!category) {
      throw new BadRequestException(
        `category is required. Available: ${this.config.knownCategories
          .map((item) => item.code)
          .join(', ')}`,
      );
    }

    const profile = getNewsCategoryProfile(category);
    if (!profile) {
      throw new BadRequestException(this.unknownCategoryMessage(category));
    }

    return profile;
  }

  private unknownCategoryMessage(category: string): string {
    return `Unknown category "${category}". Available: ${this.config.knownCategories
      .map((item) => item.code)
      .join(', ')}`;
  }

  private resolveSourcesOverride(
    options: GenerateNewsBriefOptions,
  ): string[] | undefined {
    if (!options.sources || options.sources.length === 0) return undefined;
    if (!options.category) {
      throw new BadRequestException(
        'sources override requires an explicit category',
      );
    }

    const registered = new Set(this.hotListsService.getAllSources());
    const unknown = options.sources.filter((source) => !registered.has(source));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown hot list source(s): ${unknown.join(', ')}`,
      );
    }

    return [...new Set(options.sources)];
  }

  private resolveBriefDate(date?: string): string {
    if (!date) {
      return formatBriefDate(new Date(), this.config.timezone);
    }
    return this.validateDate(date);
  }

  private validateDate(date: string): string {
    if (!DATE_PATTERN.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    return date;
  }

  private normalizePeriod(period?: string): string {
    // 空串（如 `?period=`）按缺省 daily 处理，避免前端 URLSearchParams
    // 带空值时得到 400；重复 query 参数会变成数组，同样回退到 daily。
    const raw = typeof period === 'string' ? period.trim() : '';
    const value = raw || 'daily';
    if (!PERIOD_PATTERN.test(value)) {
      throw new BadRequestException(
        'period must match ^[a-z0-9][a-z0-9-]{0,31}$',
      );
    }
    return value;
  }

  /** 删除/清理接口里 period 可省略（表示所有 period），省略时不套默认 daily。 */
  private normalizeOptionalPeriod(period?: string): string | undefined {
    const raw = typeof period === 'string' ? period.trim() : '';
    if (!raw) return undefined;
    if (!PERIOD_PATTERN.test(raw)) {
      throw new BadRequestException(
        'period must match ^[a-z0-9][a-z0-9-]{0,31}$',
      );
    }
    return raw;
  }

  private resolveOlderThanDate(olderThan?: string): string {
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

    return formatBriefDate(cutoff, this.config.timezone);
  }

  private resolveInputWindow(briefDate: string, lookbackHours: number) {
    const now = new Date();
    const today = formatBriefDate(now, this.config.timezone);
    const end =
      briefDate === today
        ? now
        : endOfBriefDate(briefDate, this.config.timezone);
    const start = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);

    return { start, end, lookbackHours };
  }

  private toResponse(
    brief: NewsBriefLean,
    includeDebug = false,
  ): NewsBriefResponse {
    const items = (brief.items ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      content: item.content,
      source: {
        code: item.source?.code ?? '',
        name: item.source?.name ?? '',
        url: item.source?.url ?? '',
      },
      ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      ...(item.tags && item.tags.length > 0 ? { tags: item.tags } : {}),
      ...(typeof item.importance === 'number'
        ? { importance: item.importance }
        : {}),
      ...(item.extensions ? { extensions: item.extensions } : {}),
    }));

    const response: NewsBriefResponse = {
      briefDate: brief.briefDate,
      period: brief.period,
      category: brief.category,
      categoryName: brief.categoryName ?? brief.category,
      status: brief.status,
      ...(brief.title ? { title: brief.title } : {}),
      ...(brief.summary ? { summary: brief.summary } : {}),
      highlights: brief.highlights ?? [],
      items,
      itemCount: items.length,
      sources: brief.sources ?? [],
      inputWindow: brief.inputWindow
        ? {
            start: new Date(brief.inputWindow.start).toISOString(),
            end: new Date(brief.inputWindow.end).toISOString(),
            lookbackHours: brief.inputWindow.lookbackHours ?? 0,
          }
        : {
            start: new Date(0).toISOString(),
            end: new Date(0).toISOString(),
            lookbackHours: 0,
          },
      ...(brief.model ? { model: brief.model } : {}),
      searchProvidersUsed: brief.searchProvidersUsed ?? [],
      ...(brief.error ? { error: brief.error } : {}),
      ...(brief.createdAt
        ? { createdAt: new Date(brief.createdAt).toISOString() }
        : {}),
      ...(brief.updatedAt
        ? { updatedAt: new Date(brief.updatedAt).toISOString() }
        : {}),
    };

    if (includeDebug) {
      return Object.assign(response, {
        rawInputItems: brief.rawInputItems ?? [],
        searchEvidence: brief.searchEvidence ?? [],
      });
    }

    return response;
  }
}
