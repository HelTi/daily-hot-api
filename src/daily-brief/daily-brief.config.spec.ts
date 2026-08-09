import { DailyBriefConfigService } from './daily-brief.config';

describe('DailyBriefConfigService', () => {
  const values: Record<string, unknown> = {
    BRIEF_ENABLED: false,
    BRIEF_CRON_EXPRESSION: '0 12 * * *',
    BRIEF_TIMEZONE: 'Asia/Shanghai',
    BRIEF_SOURCES: 'cls, eastmoney ,,gelonghui',
    BRIEF_LOOKBACK_HOURS: 24,
    BRIEF_TOP_ITEMS_PER_SOURCE: 10,
    BRIEF_MAX_TOPICS: 12,
    BRIEF_STOCK_RANKING_CACHE_TTL: 43200,
    BRIEF_GENERATING_TIMEOUT_MINUTES: 30,
    BRIEF_SOURCE_CONCURRENCY: 3,
    BRIEF_SEARCH_CONCURRENCY: 3,
    AI_MODEL: 'deepseek-v4-flash',
    AI_TIMEOUT_MS: 120000,
    AI_MAX_RETRIES: 0,
    OPENAI_API_KEY: 'sk-test',
    OPENAI_API_BASE_URL: '',
    TAVILY_API_KEY: '',
    TAVILY_MAX_RESULTS: 5,
    TAVILY_TIMEOUT_MS: 10000,
  };

  const getOrThrow = jest.fn((key: string) => {
    if (!(key in values)) {
      throw new TypeError(`Configuration key "${key}" does not exist`);
    }
    return values[key];
  });
  const config = new DailyBriefConfigService({ getOrThrow } as never);

  it('exposes every daily brief setting', () => {
    expect(config.enabled).toBe(false);
    expect(config.cronExpression).toBe('0 12 * * *');
    expect(config.timezone).toBe('Asia/Shanghai');
    expect(config.lookbackHours).toBe(24);
    expect(config.topItemsPerSource).toBe(10);
    expect(config.maxTopics).toBe(12);
    expect(config.stockRankingCacheTtl).toBe(43200);
    expect(config.generatingTimeoutMinutes).toBe(30);
    expect(config.sourceConcurrency).toBe(3);
    expect(config.searchConcurrency).toBe(3);
    expect(config.aiModel).toBe('deepseek-v4-flash');
    expect(config.aiTimeoutMs).toBe(120000);
    expect(config.tavilyMaxResults).toBe(5);
    expect(config.tavilyTimeoutMs).toBe(10000);
  });

  it('trims and filters the source list', () => {
    expect(config.sources).toEqual(['cls', 'eastmoney', 'gelonghui']);
  });

  it('keeps 0 for AI_MAX_RETRIES instead of falling back to a default', () => {
    expect(config.aiMaxRetries).toBe(0);
  });

  it('normalises an empty OPENAI_API_BASE_URL to undefined', () => {
    // OpenAI SDK 用 `??` 兜底 baseURL，空字符串会让它拼出错误的地址
    expect(config.openaiBaseUrl).toBeUndefined();

    values.OPENAI_API_BASE_URL = 'https://api.deepseek.com';
    expect(config.openaiBaseUrl).toBe('https://api.deepseek.com');
  });

  it('reports whether Tavily is configured', () => {
    expect(config.tavilyConfigured).toBe(false);

    values.TAVILY_API_KEY = 'tvly-test';
    expect(config.tavilyConfigured).toBe(true);
  });

  it('throws when a key is missing from configuration.ts', () => {
    delete values.BRIEF_TIMEZONE;
    expect(() => config.timezone).toThrow(/does not exist/);
  });
});
