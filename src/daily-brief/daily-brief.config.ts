import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 每日简报模块读取配置的统一入口。
 *
 * 默认值只存在于 `src/config/configuration.ts` 和 `src/config/validation.schema.ts`，
 * 这里一律用 `getOrThrow` 取值，不再在调用点重复写一遍默认值——
 * 之前同一个默认值散落在 service / scheduler / clients 里，改一处漏一处。
 *
 * `getOrThrow` 只在值为 `undefined` 时抛错，`false` 和 `0` 都能正常返回。
 */
@Injectable()
export class DailyBriefConfigService {
  constructor(private readonly configService: ConfigService) {}

  get enabled(): boolean {
    return this.configService.getOrThrow<boolean>('BRIEF_ENABLED');
  }

  get cronExpression(): string {
    return this.configService.getOrThrow<string>('BRIEF_CRON_EXPRESSION');
  }

  get timezone(): string {
    return this.configService.getOrThrow<string>('BRIEF_TIMEZONE');
  }

  /** 逗号分隔的源名称，已去空白并过滤空项。 */
  get sources(): string[] {
    return this.configService
      .getOrThrow<string>('BRIEF_SOURCES')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  get lookbackHours(): number {
    return this.configService.getOrThrow<number>('BRIEF_LOOKBACK_HOURS');
  }

  get topItemsPerSource(): number {
    return this.configService.getOrThrow<number>('BRIEF_TOP_ITEMS_PER_SOURCE');
  }

  get maxTopics(): number {
    return this.configService.getOrThrow<number>('BRIEF_MAX_TOPICS');
  }

  get stockRankingCacheTtl(): number {
    return this.configService.getOrThrow<number>(
      'BRIEF_STOCK_RANKING_CACHE_TTL',
    );
  }

  get generatingTimeoutMinutes(): number {
    return this.configService.getOrThrow<number>(
      'BRIEF_GENERATING_TIMEOUT_MINUTES',
    );
  }

  get sourceConcurrency(): number {
    return this.configService.getOrThrow<number>('BRIEF_SOURCE_CONCURRENCY');
  }

  get searchConcurrency(): number {
    return this.configService.getOrThrow<number>('BRIEF_SEARCH_CONCURRENCY');
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

  /**
   * 未配置时返回 undefined 而不是空字符串：
   * OpenAI SDK 用 `??` 兜底 baseURL，传空字符串会让它拼出错误的地址。
   */
  get openaiBaseUrl(): string | undefined {
    return (
      this.configService.getOrThrow<string>('OPENAI_API_BASE_URL') || undefined
    );
  }

  get tavilyApiKey(): string {
    return this.configService.getOrThrow<string>('TAVILY_API_KEY');
  }

  get tavilyConfigured(): boolean {
    return Boolean(this.tavilyApiKey);
  }

  get tavilyMaxResults(): number {
    return this.configService.getOrThrow<number>('TAVILY_MAX_RESULTS');
  }

  get tavilyTimeoutMs(): number {
    return this.configService.getOrThrow<number>('TAVILY_TIMEOUT_MS');
  }
}
