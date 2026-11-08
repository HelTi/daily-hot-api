import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NewsCategoryProfile,
  NewsCategorySummary,
} from './interfaces/news-brief.interface';
import { SearchProviderName } from '../daily-brief/interfaces/search-provider.interface';
import {
  resolveNewsCategories,
  listNewsCategoryProfiles,
} from './categories/news-category.registry';

/**
 * 通用新闻简报读取配置的统一入口。
 *
 * 默认值只存在于 `src/config/validation.schema.ts`，这里一律用
 * `getOrThrow` 取值，不在调用点重复写默认值（对齐 DailyBriefConfigService）。
 */
@Injectable()
export class NewsBriefConfigService {
  constructor(private readonly configService: ConfigService) {}

  get enabled(): boolean {
    return this.configService.getOrThrow<boolean>('NEWS_BRIEF_ENABLED');
  }

  get cronExpression(): string {
    return this.configService.getOrThrow<string>('NEWS_BRIEF_CRON_EXPRESSION');
  }

  get timezone(): string {
    return this.configService.getOrThrow<string>('NEWS_BRIEF_TIMEZONE');
  }

  /** 逗号分隔的板块 code，已去空白并过滤空项。 */
  get categoryCodes(): string[] {
    return this.configService
      .getOrThrow<string>('NEWS_BRIEF_CATEGORIES')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /** 启用板块的 profile 列表（未知 code 抛错，启动阶段 fail fast）。 */
  get categories(): NewsCategoryProfile[] {
    return resolveNewsCategories(this.categoryCodes);
  }

  get lookbackHours(): number {
    return this.configService.getOrThrow<number>('NEWS_BRIEF_LOOKBACK_HOURS');
  }

  get topItemsPerSource(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_TOP_ITEMS_PER_SOURCE',
    );
  }

  get maxCandidates(): number {
    return this.configService.getOrThrow<number>('NEWS_BRIEF_MAX_CANDIDATES');
  }

  get maxItemsPerCategory(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY',
    );
  }

  get sourceConcurrency(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_SOURCE_CONCURRENCY',
    );
  }

  get categoryConcurrency(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_CATEGORY_CONCURRENCY',
    );
  }

  get generatingTimeoutMinutes(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES',
    );
  }

  /**
   * 是否允许手动生成接口。
   * 产品要求前端不允许触发生成，因此默认关闭，仅运维临时开启。
   */
  get manualGenerateEnabled(): boolean {
    return this.configService.getOrThrow<boolean>(
      'NEWS_BRIEF_MANUAL_GENERATE_ENABLED',
    );
  }

  /** P1 搜索增强总开关，默认关闭。 */
  get searchEnabled(): boolean {
    return this.configService.getOrThrow<boolean>('NEWS_BRIEF_SEARCH_ENABLED');
  }

  /** 每个板块最多为多少条候选补充搜索证据。 */
  get searchMaxQueries(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_SEARCH_MAX_QUERIES',
    );
  }

  get searchConcurrency(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_SEARCH_CONCURRENCY',
    );
  }

  /** 单条搜索词最大字符数（产品要求 2000 字以内）。 */
  get searchQueryMaxChars(): number {
    return this.configService.getOrThrow<number>(
      'NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS',
    );
  }

  /** 搜索平台优先级；空列表表示关闭搜索增强。 */
  get searchProviders(): SearchProviderName[] {
    return this.configService
      .getOrThrow<string>('NEWS_BRIEF_SEARCH_PROVIDERS')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean) as SearchProviderName[];
  }

  get aiModel(): string {
    return this.configService.getOrThrow<string>('AI_MODEL');
  }

  get aiTimeoutMs(): number {
    return this.configService.getOrThrow<number>('AI_TIMEOUT_MS');
  }

  get aiMaxRetries(): number {
    return this.configService.getOrThrow<number>('AI_MAX_RETRIES');
  }

  get openaiApiKey(): string {
    return this.configService.getOrThrow<string>('OPENAI_API_KEY');
  }

  /** 未配置时返回 undefined：OpenAI SDK 用 `??` 兜底 baseURL。 */
  get openaiBaseUrl(): string | undefined {
    return (
      this.configService.getOrThrow<string>('OPENAI_API_BASE_URL') || undefined
    );
  }

  /** 全部已注册板块（含未启用的），供只读接口做 code 合法性校验。 */
  get knownCategories(): NewsCategoryProfile[] {
    return listNewsCategoryProfiles();
  }

  toCategorySummary(profile: NewsCategoryProfile): NewsCategorySummary {
    return {
      code: profile.code,
      name: profile.name,
      description: profile.description,
      sources: profile.sources,
      maxItems: profile.maxItems,
    };
  }

  get categorySummaries(): NewsCategorySummary[] {
    return this.categories.map((profile) => this.toCategorySummary(profile));
  }
}
