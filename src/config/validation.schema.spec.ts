import { configValidationSchema } from './validation.schema';

describe('configValidationSchema', () => {
  it('uses one set of defaults for runtime configuration', () => {
    const config = configValidationSchema.parse({});
    expect(config.PORT).toBe(6689);
    expect(config.SCHEDULER_AUTO_START).toBe(false);
    expect(config.BRIEF_SOURCES).toContain('gelonghui');
    expect(config.REQUEST_TIMEOUT).toBe(6000);
    expect(config.BRIEF_SEARCH_PROVIDERS).toBe('tavily,deepseek');
  });

  it('rejects a topic count the prompt budget cannot carry', () => {
    // 超过 PROMPT_BUDGET.maxTopics 的主题进不了提示词，只会白付搜索费用。
    expect(() =>
      configValidationSchema.parse({ BRIEF_MAX_TOPICS: '20' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ BRIEF_MAX_TOPICS: '8' }).BRIEF_MAX_TOPICS,
    ).toBe(8);
  });

  it('rejects invalid boolean values', () => {
    expect(() =>
      configValidationSchema.parse({ BRIEF_ENABLED: 'yes' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ BRIEF_ENABLED: 'true' }).BRIEF_ENABLED,
    ).toBe(true);
  });

  it('validates ordered search providers and DeepSeek limits', () => {
    expect(
      configValidationSchema.parse({
        BRIEF_SEARCH_PROVIDERS: 'deepseek, tavily',
      }).BRIEF_SEARCH_PROVIDERS,
    ).toBe('deepseek, tavily');
    expect(() =>
      configValidationSchema.parse({ BRIEF_SEARCH_PROVIDERS: 'bing' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ BRIEF_SEARCH_PROVIDERS: 'tavily,tavily' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ DEEPSEEK_SEARCH_MAX_RESULTS: 51 }),
    ).toThrow();
  });
});

describe('configValidationSchema news brief', () => {
  it('uses one set of defaults for the news brief configuration', () => {
    const config = configValidationSchema.parse({});

    expect(config.NEWS_BRIEF_ENABLED).toBe(false);
    expect(config.NEWS_BRIEF_CRON_EXPRESSION).toBe('30 8 * * *');
    expect(config.NEWS_BRIEF_TIMEZONE).toBe('Asia/Shanghai');
    expect(config.NEWS_BRIEF_CATEGORIES).toBe('finance,general,tech,sports');
    expect(config.NEWS_BRIEF_LOOKBACK_HOURS).toBe(24);
    expect(config.NEWS_BRIEF_TOP_ITEMS_PER_SOURCE).toBe(8);
    expect(config.NEWS_BRIEF_MAX_CANDIDATES).toBe(40);
    expect(config.NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY).toBe(8);
    expect(config.NEWS_BRIEF_SOURCE_CONCURRENCY).toBe(3);
    expect(config.NEWS_BRIEF_CATEGORY_CONCURRENCY).toBe(1);
    expect(config.NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES).toBe(30);
    // 产品要求：手动生成默认禁用，只能由运维显式开启
    expect(config.NEWS_BRIEF_MANUAL_GENERATE_ENABLED).toBe(false);
  });

  it('keeps the existing daily brief defaults untouched', () => {
    const config = configValidationSchema.parse({});

    expect(config.BRIEF_ENABLED).toBe(false);
    expect(config.BRIEF_CRON_EXPRESSION).toBe('0 12 * * *');
    expect(config.BRIEF_MAX_TOPICS).toBe(12);
    expect(config.BRIEF_SEARCH_PROVIDERS).toBe('tavily,deepseek');
    expect(config.BRIEF_SOURCES).toBe(
      'cls,yicai,wallstreet,jin10,tonghuashun,eastmoney,gelonghui',
    );
  });

  it('rejects a candidate budget the prompt cannot carry', () => {
    // 上限与 PROMPT_BUDGET.maxCandidates 对齐，配大了只会静默截断
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_MAX_CANDIDATES: '41' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_MAX_CANDIDATES: '9' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ NEWS_BRIEF_MAX_CANDIDATES: '40' })
        .NEWS_BRIEF_MAX_CANDIDATES,
    ).toBe(40);
  });

  it('rejects an items-per-category budget outside 3-10', () => {
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY: '11' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY: '2' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY: '10' })
        .NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY,
    ).toBe(10);
    expect(
      configValidationSchema.parse({ NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY: '3' })
        .NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY,
    ).toBe(3);
  });

  it('rejects duplicate or empty category codes', () => {
    expect(() =>
      configValidationSchema.parse({
        NEWS_BRIEF_CATEGORIES: 'finance,finance',
      }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_CATEGORIES: '' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_CATEGORIES: ' , ' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({
        NEWS_BRIEF_CATEGORIES: 'finance, general',
      }).NEWS_BRIEF_CATEGORIES,
    ).toBe('finance, general');
  });

  it('rejects category codes that are not in the code registry', () => {
    // 已被产品移除的汽车板块（auto）不能再出现在配置里
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_CATEGORIES: 'finance,auto' }),
    ).toThrow(/NEWS_BRIEF_CATEGORIES/);
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_CATEGORIES: 'unknown' }),
    ).toThrow(/NEWS_BRIEF_CATEGORIES/);
    expect(
      configValidationSchema.parse({
        NEWS_BRIEF_CATEGORIES: 'tech,sports,finance,general',
      }).NEWS_BRIEF_CATEGORIES,
    ).toBe('tech,sports,finance,general');
  });

  it('rejects invalid booleans and out-of-range budgets', () => {
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_ENABLED: 'yes' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ NEWS_BRIEF_ENABLED: 'true' })
        .NEWS_BRIEF_ENABLED,
    ).toBe(true);
    expect(() =>
      configValidationSchema.parse({
        NEWS_BRIEF_MANUAL_GENERATE_ENABLED: 'yes',
      }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_TOP_ITEMS_PER_SOURCE: '21' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_CATEGORY_CONCURRENCY: '5' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_LOOKBACK_HOURS: '0' }),
    ).toThrow();
  });
});

describe('configValidationSchema news brief search', () => {
  it('uses one set of defaults for the search enhancement configuration', () => {
    const config = configValidationSchema.parse({});

    // P1 搜索增强默认关闭：开启会产生额外搜索费用
    expect(config.NEWS_BRIEF_SEARCH_ENABLED).toBe(false);
    expect(config.NEWS_BRIEF_SEARCH_MAX_QUERIES).toBe(6);
    expect(config.NEWS_BRIEF_SEARCH_CONCURRENCY).toBe(3);
    expect(config.NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS).toBe(2000);
    expect(config.NEWS_BRIEF_SEARCH_PROVIDERS).toBe('tavily,deepseek');
  });

  it('rejects a query budget outside 1-8', () => {
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_MAX_QUERIES: '9' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_MAX_QUERIES: '0' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_MAX_QUERIES: '8' })
        .NEWS_BRIEF_SEARCH_MAX_QUERIES,
    ).toBe(8);
    expect(
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_MAX_QUERIES: '1' })
        .NEWS_BRIEF_SEARCH_MAX_QUERIES,
    ).toBe(1);
  });

  it('rejects a query length outside 100-2000 chars', () => {
    // 产品要求单条搜索词上限 2000 字，配大了提示词和搜索 API 都不可控
    expect(() =>
      configValidationSchema.parse({
        NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS: '2001',
      }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({
        NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS: '99',
      }),
    ).toThrow();
    expect(
      configValidationSchema.parse({
        NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS: '2000',
      }).NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS,
    ).toBe(2000);
  });

  it('rejects non-positive concurrency and invalid booleans', () => {
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_CONCURRENCY: '0' }),
    ).toThrow();
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_ENABLED: 'yes' }),
    ).toThrow();
    expect(
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_ENABLED: 'true' })
        .NEWS_BRIEF_SEARCH_ENABLED,
    ).toBe(true);
  });

  it('validates ordered search providers', () => {
    expect(
      configValidationSchema.parse({
        NEWS_BRIEF_SEARCH_PROVIDERS: 'deepseek, tavily',
      }).NEWS_BRIEF_SEARCH_PROVIDERS,
    ).toBe('deepseek, tavily');
    expect(
      configValidationSchema.parse({
        NEWS_BRIEF_SEARCH_PROVIDERS: 'tavily',
      }).NEWS_BRIEF_SEARCH_PROVIDERS,
    ).toBe('tavily');
    expect(
      configValidationSchema.parse({
        NEWS_BRIEF_SEARCH_PROVIDERS: 'tavily,',
      }).NEWS_BRIEF_SEARCH_PROVIDERS,
    ).toBe('tavily,');
    // 平台名非法或重复都在建连前拒绝
    expect(() =>
      configValidationSchema.parse({ NEWS_BRIEF_SEARCH_PROVIDERS: 'bing' }),
    ).toThrow(/NEWS_BRIEF_SEARCH_PROVIDERS/);
    expect(() =>
      configValidationSchema.parse({
        NEWS_BRIEF_SEARCH_PROVIDERS: 'tavily,tavily',
      }),
    ).toThrow(/NEWS_BRIEF_SEARCH_PROVIDERS/);
  });
});
