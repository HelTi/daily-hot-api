import { NewsBriefConfigService } from './news-brief.config';
import { NEWS_CATEGORY_PROFILES } from './categories/news-category.registry';

describe('NewsBriefConfigService', () => {
  const values: Record<string, unknown> = {
    NEWS_BRIEF_ENABLED: false,
    NEWS_BRIEF_CRON_EXPRESSION: '30 8 * * *',
    NEWS_BRIEF_TIMEZONE: 'Asia/Shanghai',
    NEWS_BRIEF_CATEGORIES: 'finance, general ,,tech',
    NEWS_BRIEF_LOOKBACK_HOURS: 24,
    NEWS_BRIEF_TOP_ITEMS_PER_SOURCE: 8,
    NEWS_BRIEF_MAX_CANDIDATES: 40,
    NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY: 8,
    NEWS_BRIEF_SOURCE_CONCURRENCY: 3,
    NEWS_BRIEF_CATEGORY_CONCURRENCY: 1,
    NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES: 30,
    NEWS_BRIEF_MANUAL_GENERATE_ENABLED: false,
    NEWS_BRIEF_SEARCH_ENABLED: false,
    NEWS_BRIEF_SEARCH_MAX_QUERIES: 6,
    NEWS_BRIEF_SEARCH_CONCURRENCY: 3,
    NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS: 2000,
    NEWS_BRIEF_SEARCH_PROVIDERS: 'tavily, deepseek',
    AI_MODEL: 'deepseek-v4-flash',
    AI_TIMEOUT_MS: 120000,
    AI_MAX_RETRIES: 2,
    OPENAI_API_KEY: 'sk-test',
    OPENAI_API_BASE_URL: '',
  };

  const getOrThrow = jest.fn((key: string) => {
    if (!(key in values)) {
      throw new TypeError(`Configuration key "${key}" does not exist`);
    }
    return values[key];
  });
  const config = new NewsBriefConfigService({ getOrThrow } as never);

  it('exposes every news brief setting through getOrThrow', () => {
    getOrThrow.mockClear();

    expect(config.enabled).toBe(false);
    expect(config.cronExpression).toBe('30 8 * * *');
    expect(config.timezone).toBe('Asia/Shanghai');
    expect(config.categoryCodes).toEqual(['finance', 'general', 'tech']);
    expect(config.lookbackHours).toBe(24);
    expect(config.topItemsPerSource).toBe(8);
    expect(config.maxCandidates).toBe(40);
    expect(config.maxItemsPerCategory).toBe(8);
    expect(config.sourceConcurrency).toBe(3);
    expect(config.categoryConcurrency).toBe(1);
    expect(config.generatingTimeoutMinutes).toBe(30);
    expect(config.manualGenerateEnabled).toBe(false);
    expect(config.searchEnabled).toBe(false);
    expect(config.searchMaxQueries).toBe(6);
    expect(config.searchConcurrency).toBe(3);
    expect(config.searchQueryMaxChars).toBe(2000);
    expect(config.searchProviders).toEqual(['tavily', 'deepseek']);
    expect(config.aiModel).toBe('deepseek-v4-flash');
    expect(config.aiTimeoutMs).toBe(120000);
    expect(config.aiMaxRetries).toBe(2);
    expect(config.openaiApiKey).toBe('sk-test');

    const requestedKeys = getOrThrow.mock.calls.map(([key]) => key);
    expect(requestedKeys).toEqual(
      expect.arrayContaining([
        'NEWS_BRIEF_ENABLED',
        'NEWS_BRIEF_CRON_EXPRESSION',
        'NEWS_BRIEF_TIMEZONE',
        'NEWS_BRIEF_CATEGORIES',
        'NEWS_BRIEF_LOOKBACK_HOURS',
        'NEWS_BRIEF_TOP_ITEMS_PER_SOURCE',
        'NEWS_BRIEF_MAX_CANDIDATES',
        'NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY',
        'NEWS_BRIEF_SOURCE_CONCURRENCY',
        'NEWS_BRIEF_CATEGORY_CONCURRENCY',
        'NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES',
        'NEWS_BRIEF_MANUAL_GENERATE_ENABLED',
        'NEWS_BRIEF_SEARCH_ENABLED',
        'NEWS_BRIEF_SEARCH_MAX_QUERIES',
        'NEWS_BRIEF_SEARCH_CONCURRENCY',
        'NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS',
        'NEWS_BRIEF_SEARCH_PROVIDERS',
        'AI_MODEL',
        'AI_TIMEOUT_MS',
        'AI_MAX_RETRIES',
        'OPENAI_API_KEY',
      ]),
    );
  });

  it('trims and filters configured category codes', () => {
    expect(config.categoryCodes).toEqual(['finance', 'general', 'tech']);
  });

  it('resolves categories in configured order and drops duplicates', () => {
    values.NEWS_BRIEF_CATEGORIES = 'sports, tech ,,sports';

    expect(config.categories.map((profile) => profile.code)).toEqual([
      'sports',
      'tech',
    ]);
  });

  it('throws when the configuration contains an unknown category', () => {
    values.NEWS_BRIEF_CATEGORIES = 'finance,auto';

    expect(() => config.categories).toThrow(/Unknown news brief category/);
  });

  it('keeps manual generation disabled by default', () => {
    // 产品要求前端不能触发生成接口：默认必须是 false，只能由运维显式开启
    expect(config.manualGenerateEnabled).toBe(false);

    values.NEWS_BRIEF_MANUAL_GENERATE_ENABLED = true;
    expect(config.manualGenerateEnabled).toBe(true);
  });

  it('normalises an empty OPENAI_API_BASE_URL to undefined', () => {
    // OpenAI SDK 用 `??` 兜底 baseURL，空字符串会拼出错误地址
    expect(config.openaiBaseUrl).toBeUndefined();

    values.OPENAI_API_BASE_URL = 'https://api.deepseek.com';
    expect(config.openaiBaseUrl).toBe('https://api.deepseek.com');
  });

  it('lists every registered category, including disabled ones', () => {
    values.NEWS_BRIEF_CATEGORIES = 'finance';

    expect(config.knownCategories).toEqual(NEWS_CATEGORY_PROFILES);
    expect(config.knownCategories.map((profile) => profile.code)).toEqual([
      'finance',
      'general',
      'tech',
      'sports',
    ]);
  });

  it('exposes frontend-safe category summaries without prompt internals', () => {
    values.NEWS_BRIEF_CATEGORIES = 'finance';

    const summaries = config.categorySummaries;

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      code: 'finance',
      name: '财经',
      description: '货币政策、市场与公司事件、产业经济、宏观数据',
      sources: NEWS_CATEGORY_PROFILES[0].sources,
      maxItems: 8,
    });
    expect(summaries[0]).not.toHaveProperty('focus');
    expect(summaries[0]).not.toHaveProperty('search');
    expect(config.toCategorySummary(NEWS_CATEGORY_PROFILES[1])).toEqual(
      expect.objectContaining({ code: 'general' }),
    );
  });

  it('parses the ordered search provider list', () => {
    expect(config.searchProviders).toEqual(['tavily', 'deepseek']);

    values.NEWS_BRIEF_SEARCH_PROVIDERS = '';
    expect(config.searchProviders).toEqual([]);
  });

  it('reports search enhancement state from configuration', () => {
    expect(config.searchEnabled).toBe(false);

    values.NEWS_BRIEF_SEARCH_ENABLED = true;
    expect(config.searchEnabled).toBe(true);
  });

  it('throws when a key is missing from configuration.ts', () => {
    delete values.NEWS_BRIEF_TIMEZONE;
    expect(() => config.timezone).toThrow(/does not exist/);
  });
});
