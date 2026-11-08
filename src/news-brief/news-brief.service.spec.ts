import { BadRequestException, Logger } from '@nestjs/common';
import { NewsBriefService } from './news-brief.service';
import {
  listNewsCategoryProfiles,
  getNewsCategoryProfile,
} from './categories/news-category.registry';
import {
  NewsBriefSearchEvidence,
  NewsCategoryProfile,
} from './interfaces/news-brief.interface';

const techProfile = getNewsCategoryProfile('tech') as NewsCategoryProfile;

const buildFreshSourceItem = (source: string) => ({
  title: `${source}-标题`,
  desc: '描述',
  url: `https://example.com/${source}`,
  timestamp: 1700000000000,
});

const mockFreshSourceItems = (execute: jest.Mock) =>
  execute.mockImplementation((source: string) =>
    Promise.resolve({ success: true, items: [buildFreshSourceItem(source)] }),
  );

const buildSuccessBrief = (overrides: Record<string, unknown> = {}) => ({
  briefDate: '2026-11-08',
  period: 'daily',
  category: 'tech',
  categoryName: '科技',
  status: 'success',
  title: '科技简报',
  summary: '科技摘要',
  highlights: ['要点'],
  items: [
    {
      id: 'abc123def456',
      title: '标题',
      summary: '摘要',
      content: '内容',
      source: {
        code: '36kr',
        name: '36氪',
        url: 'https://example.com/a',
      },
    },
  ],
  sources: techProfile.sources,
  inputWindow: {
    start: new Date('2026-11-07T00:00:00.000Z'),
    end: new Date('2026-11-08T00:00:00.000Z'),
    lookbackHours: 24,
  },
  searchProvidersUsed: [],
  model: 'test-model',
  ...overrides,
});

describe('NewsBriefService generate', () => {
  const findByDate = jest.fn();
  const findLatest = jest.fn();
  const claimGeneration = jest.fn();
  const heartbeatGeneration = jest.fn();
  const markSuccess = jest.fn();
  const markFailed = jest.fn();
  const getDataByTimeRange = jest.fn();
  const execute = jest.fn();
  const getAllSources = jest.fn();
  const getAllSourcesWithMetadata = jest.fn();
  const analyzeNewsBrief = jest.fn();
  const getModel = jest.fn();
  const searchIsConfigured = jest.fn();
  const search = jest.fn();
  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  let config: Record<string, unknown>;
  let service: NewsBriefService;

  beforeEach(() => {
    config = {
      timezone: 'Asia/Shanghai',
      categories: [techProfile],
      knownCategories: listNewsCategoryProfiles(),
      lookbackHours: 24,
      topItemsPerSource: 8,
      maxCandidates: 40,
      maxItemsPerCategory: 8,
      sourceConcurrency: 3,
      categoryConcurrency: 1,
      generatingTimeoutMinutes: 30,
      manualGenerateEnabled: false,
      model: 'test-model',
      searchEnabled: false,
      searchMaxQueries: 6,
      searchConcurrency: 3,
      searchQueryMaxChars: 2000,
      searchProviders: ['tavily'],
    };
    findByDate.mockReset().mockResolvedValue(null);
    findLatest.mockReset().mockResolvedValue(null);
    claimGeneration.mockReset().mockResolvedValue(true);
    heartbeatGeneration.mockReset().mockResolvedValue(undefined);
    markSuccess
      .mockReset()
      .mockImplementation(
        (briefDate: string, period: string, category: string) =>
          Promise.resolve(buildSuccessBrief({ briefDate, period, category })),
      );
    markFailed.mockReset().mockResolvedValue({ retained: false, brief: null });
    getDataByTimeRange.mockReset().mockResolvedValue([]);
    execute.mockReset().mockResolvedValue({ success: false, items: [] });
    getAllSources
      .mockReset()
      .mockReturnValue([
        'cls',
        '36kr',
        'ithome',
        'huxiu',
        'geekpark',
        'ifanr',
        'sspai',
        'juejin',
        'xinyu',
      ]);
    getAllSourcesWithMetadata
      .mockReset()
      .mockReturnValue([{ name: '36kr', title: '36氪' }]);
    analyzeNewsBrief.mockReset().mockResolvedValue({
      title: 'AI 标题',
      summary: 'AI 摘要',
      highlights: ['要点'],
      items: [],
    });
    getModel.mockReset().mockReturnValue('test-model');
    searchIsConfigured.mockReset().mockReturnValue(false);
    search.mockReset().mockResolvedValue({ provider: 'tavily', results: [] });
    cacheGet.mockReset().mockResolvedValue(null);
    cacheSet.mockReset().mockResolvedValue(undefined);

    service = new NewsBriefService(
      config as never,
      {
        findByDate,
        findLatest,
        claimGeneration,
        heartbeatGeneration,
        markSuccess,
        markFailed,
      } as never,
      { getDataByTimeRange } as never,
      { execute } as never,
      { getAllSources, getAllSourcesWithMetadata } as never,
      { analyzeNewsBrief, getModel } as never,
      { isConfigured: searchIsConfigured, search } as never,
      { get: cacheGet, set: cacheSet } as never,
    );
  });

  it('skips generation when a successful brief already exists', async () => {
    findByDate.mockResolvedValue(buildSuccessBrief());

    const result = await service.generate({ category: 'tech' });

    expect(result.results).toHaveLength(1);
    const [outcome] = result.results;
    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') throw new Error('expected skipped');
    expect(outcome.reason).toBe('already_generated');
    expect(outcome.category).toBe('tech');
    expect(outcome.categoryName).toBe('科技');
    expect(outcome.brief).toMatchObject({ status: 'success' });
    expect(claimGeneration).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(analyzeNewsBrief).not.toHaveBeenCalled();
  });

  it('reports generation_in_progress when the claim is rejected', async () => {
    claimGeneration.mockResolvedValue(false);

    const result = await service.generate({ category: 'tech' });

    const [outcome] = result.results;
    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') throw new Error('expected skipped');
    expect(outcome.reason).toBe('generation_in_progress');
    expect(execute).not.toHaveBeenCalled();
    expect(analyzeNewsBrief).not.toHaveBeenCalled();
  });

  it('marks the generation failed when no candidates are available', async () => {
    const result = await service.generate({ category: 'tech', force: true });

    const [outcome] = result.results;
    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') throw new Error('expected failed');
    expect(outcome.error).toContain('No hot items available');
    expect(outcome.previousBriefRetained).toBeUndefined();
    expect(markFailed).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'tech',
      expect.any(String),
      expect.stringContaining('No hot items available'),
    );
    expect(analyzeNewsBrief).not.toHaveBeenCalled();
  });

  it('keeps the previous successful brief when a forced regeneration fails', async () => {
    const previousSuccess = buildSuccessBrief();
    execute.mockResolvedValue({
      success: true,
      items: [
        {
          title: '新标题',
          desc: '新描述',
          url: 'https://example.com/new',
          timestamp: 1700000000000,
        },
      ],
    });
    analyzeNewsBrief.mockRejectedValue(new Error('AI exploded'));
    markFailed.mockResolvedValue({ retained: true, brief: previousSuccess });

    const result = await service.generate({ category: 'tech', force: true });

    const [outcome] = result.results;
    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') throw new Error('expected failed');
    expect(outcome.error).toBe('AI exploded');
    expect(outcome.previousBriefRetained).toBe(true);
    expect(outcome.brief).toMatchObject({
      status: 'success',
      title: '科技简报',
    });
    expect(markFailed).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'tech',
      expect.any(String),
      'AI exploded',
    );
  });

  it('runs the AI analysis and records a successful brief', async () => {
    execute.mockImplementation((source: string) =>
      Promise.resolve({
        success: true,
        items: [
          {
            title: `${source}-标题`,
            desc: '描述',
            url: `https://example.com/${source}`,
            timestamp: 1700000000000,
          },
        ],
      }),
    );

    const result = await service.generate({ category: 'tech', force: true });

    const [outcome] = result.results;
    expect(outcome.status).toBe('success');
    if (outcome.status !== 'success') throw new Error('expected success');
    expect(outcome.brief).toMatchObject({
      category: 'tech',
      status: 'success',
      itemCount: 1,
    });
    expect(execute).toHaveBeenCalledTimes(techProfile.sources.length);
    expect(analyzeNewsBrief).toHaveBeenCalledTimes(1);

    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      category: NewsCategoryProfile;
      briefDate: string;
      items: unknown[];
      outputItemCount: number;
      contentMaxChars: number;
      searchEvidence: unknown[];
    };
    expect(analysisInput.category.code).toBe('tech');
    expect(analysisInput.briefDate).toEqual(expect.any(String));
    expect(analysisInput.items).toHaveLength(techProfile.sources.length);
    // min(profile.maxItems=8, maxItemsPerCategory=8, PROMPT_BUDGET.maxOutputItems=10)
    expect(analysisInput.outputItemCount).toBe(8);
    // P0 未开启搜索增强：content 上限 300，证据为空
    expect(analysisInput.contentMaxChars).toBe(300);
    expect(analysisInput.searchEvidence).toEqual([]);

    expect(markSuccess).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'tech',
      expect.any(String),
      expect.objectContaining({
        title: 'AI 标题',
        summary: 'AI 摘要',
        model: 'test-model',
        sources: techProfile.sources,
        searchProvidersUsed: [],
        searchEvidence: [],
      }),
    );
  });

  it('refreshes a shared source only once per generate run', async () => {
    // general 与 sports 共用 weibo/baidu/zhihu/toutiao/sina-news，刷新走的是
    // noCache=true 的真实上游请求，一次运行里不能重复打。
    const general = getNewsCategoryProfile('general') as NewsCategoryProfile;
    const sports = getNewsCategoryProfile('sports') as NewsCategoryProfile;
    config.categories = [general, sports];
    config.categoryConcurrency = 2;
    const uniqueSources = new Set([...general.sources, ...sports.sources]);
    expect(uniqueSources.size).toBeLessThan(
      general.sources.length + sports.sources.length,
    );
    mockFreshSourceItems(execute);

    const result = await service.generate({ force: true });

    expect(result.results.map((item) => item.status)).toEqual([
      'success',
      'success',
    ]);
    expect(execute).toHaveBeenCalledTimes(uniqueSources.size);
    const requested = execute.mock.calls.map(([source]: [string]) => source);
    expect(new Set(requested)).toEqual(uniqueSources);
  });

  it('pushes the per-source limit down to the history query', async () => {
    config.topItemsPerSource = 3;
    mockFreshSourceItems(execute);

    await service.generate({ category: 'tech', force: true });

    expect(getDataByTimeRange).toHaveBeenCalledTimes(
      techProfile.sources.length,
    );
    for (const call of getDataByTimeRange.mock.calls) {
      expect(call[3]).toBe(3);
    }
  });

  it('keeps more than topItemsPerSource candidates when a source has more', async () => {
    // 新鲜抓取与历史各取前 N 条，去重后同一来源最多会有 2N 条候选；
    // 交错轮次上限必须按最长的来源桶算，不能按 topItemsPerSource 截断。
    config.topItemsPerSource = 2;
    execute.mockImplementation((source: string) =>
      Promise.resolve({
        success: true,
        items: [
          {
            title: `${source}-新鲜-1`,
            url: `https://example.com/${source}/fresh-1`,
            timestamp: 1700000002000,
          },
          {
            title: `${source}-新鲜-2`,
            url: `https://example.com/${source}/fresh-2`,
            timestamp: 1700000001000,
          },
        ],
      }),
    );
    getDataByTimeRange.mockImplementation((source: string) =>
      Promise.resolve([
        {
          title: `${source}-历史-1`,
          url: `https://example.com/${source}/history-1`,
          timestamp: 1699999999000,
        },
        {
          title: `${source}-历史-2`,
          url: `https://example.com/${source}/history-2`,
          timestamp: 1699999998000,
        },
      ]),
    );
    config.categories = [{ ...techProfile, sources: ['36kr'] }];

    await service.generate({ category: 'tech', force: true });

    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      items: { url: string }[];
    };
    expect(analysisInput.items).toHaveLength(4);
    expect(analysisInput.items.map((item) => item.url)).toEqual([
      'https://example.com/36kr/fresh-1',
      'https://example.com/36kr/fresh-2',
      'https://example.com/36kr/history-1',
      'https://example.com/36kr/history-2',
    ]);
  });

  it('stops interleaving candidates at maxCandidates', async () => {
    config.maxCandidates = 3;
    mockFreshSourceItems(execute);

    await service.generate({ category: 'tech', force: true });

    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      items: unknown[];
    };
    expect(analysisInput.items).toHaveLength(3);
  });

  it('reports a category as failed when the claim itself throws', async () => {
    // 契约是「每个板块都有一条 result」：claim 阶段的 Mongo 抖动不能让整个请求 500
    const general = getNewsCategoryProfile('general') as NewsCategoryProfile;
    config.categories = [general, techProfile];
    claimGeneration.mockImplementation((data: { category: string }) => {
      if (data.category === 'general') throw new Error('mongo down');
      return Promise.resolve(true);
    });
    mockFreshSourceItems(execute);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const result = await service.generate({ force: true });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      category: 'general',
      status: 'failed',
      error: 'mongo down',
    });
    expect(result.results[1]).toMatchObject({
      category: 'tech',
      status: 'success',
    });
    expect(markFailed).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('does not call search at all when search enhancement is disabled', async () => {
    mockFreshSourceItems(execute);

    await service.generate({ category: 'tech', force: true });

    expect(searchIsConfigured).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(cacheGet).not.toHaveBeenCalled();
    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      contentMaxChars: number;
      searchEvidence: unknown[];
    };
    expect(analysisInput.contentMaxChars).toBe(300);
    expect(analysisInput.searchEvidence).toEqual([]);
    expect(markSuccess).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'tech',
      expect.any(String),
      expect.objectContaining({ searchEvidence: [], searchProvidersUsed: [] }),
    );
  });

  it('degrades to empty evidence and warns when no search provider is configured', async () => {
    config.searchEnabled = true;
    searchIsConfigured.mockReturnValue(false);
    mockFreshSourceItems(execute);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const result = await service.generate({ category: 'tech', force: true });

    expect(result.results[0].status).toBe('success');
    expect(searchIsConfigured).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no search provider is configured'),
    );
    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      contentMaxChars: number;
      searchEvidence: unknown[];
    };
    // 没有可用平台 = 没有证据：content 上限必须退回 300，否则模型会在只有
    // 标题/摘要的输入上硬凑 600 字（设计文档 R1）。
    expect(analysisInput.contentMaxChars).toBe(300);
    expect(analysisInput.searchEvidence).toEqual([]);
    warn.mockRestore();
  });

  it('skips search for a category whose profile opts out', async () => {
    config.searchEnabled = true;
    config.categories = [{ ...techProfile, search: false }];
    searchIsConfigured.mockReturnValue(true);
    mockFreshSourceItems(execute);

    const result = await service.generate({ category: 'tech', force: true });

    expect(result.results[0].status).toBe('success');
    expect(searchIsConfigured).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      contentMaxChars: number;
      searchEvidence: unknown[];
    };
    expect(analysisInput.contentMaxChars).toBe(300);
    expect(analysisInput.searchEvidence).toEqual([]);
  });

  it('adds search evidence, records the providers and raises the content limit', async () => {
    config.searchEnabled = true;
    config.searchMaxQueries = 2;
    searchIsConfigured.mockReturnValue(true);
    const outcome = {
      provider: 'tavily',
      results: [
        {
          title: '证据标题',
          url: 'https://evidence.example.com/1',
          content: '证据摘要',
        },
      ],
    };
    search.mockResolvedValue(outcome);
    mockFreshSourceItems(execute);

    const result = await service.generate({ category: 'tech', force: true });

    expect(result.results[0].status).toBe('success');
    // searchMaxQueries=2：只给前 2 条候选补充证据
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[0][0]).toBe('36kr-标题 描述');

    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      contentMaxChars: number;
      searchEvidence: NewsBriefSearchEvidence[];
    };
    expect(analysisInput.contentMaxChars).toBe(600);
    expect(analysisInput.searchEvidence).toHaveLength(2);
    expect(analysisInput.searchEvidence[0]).toMatchObject({
      topicTitle: '36kr-标题',
      query: '36kr-标题 描述',
      provider: 'tavily',
      results: outcome.results,
    });

    // 成功的查询写入 1 小时缓存，key 带 news-brief:search:v1 前缀
    expect(cacheGet).toHaveBeenCalledWith(
      expect.stringContaining('news-brief:search:v1:'),
    );
    expect(cacheSet).toHaveBeenCalledWith(
      expect.stringContaining('news-brief:search:v1:'),
      expect.objectContaining({ data: outcome }),
      3600,
    );
    expect(markSuccess).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'tech',
      expect.any(String),
      expect.objectContaining({
        searchProvidersUsed: ['tavily'],
        searchEvidence: expect.any(Array),
      }),
    );
  });

  it('bounds the search query to NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS', async () => {
    config.searchEnabled = true;
    config.searchMaxQueries = 1;
    config.searchQueryMaxChars = 6;
    searchIsConfigured.mockReturnValue(true);
    mockFreshSourceItems(execute);

    await service.generate({ category: 'tech', force: true });

    expect(search).toHaveBeenCalledTimes(1);
    // '36kr-标题 描述' 截断到 6 个字符
    expect(search.mock.calls[0][0]).toBe('36kr-标');
  });

  it('reuses a cached search outcome without calling the provider', async () => {
    config.searchEnabled = true;
    config.searchMaxQueries = 1;
    searchIsConfigured.mockReturnValue(true);
    const cachedOutcome = {
      provider: 'deepseek',
      results: [
        {
          title: '缓存证据',
          url: 'https://cache.example.com/1',
          content: '缓存摘要',
        },
      ],
    };
    cacheGet.mockResolvedValue({
      data: cachedOutcome,
      updateTime: '2026-11-08T00:00:00.000Z',
    });
    mockFreshSourceItems(execute);

    await service.generate({ category: 'tech', force: true });

    expect(search).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      searchEvidence: NewsBriefSearchEvidence[];
    };
    expect(analysisInput.searchEvidence[0]).toMatchObject({
      provider: 'deepseek',
      results: cachedOutcome.results,
    });
    expect(markSuccess).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'tech',
      expect.any(String),
      expect.objectContaining({ searchProvidersUsed: ['deepseek'] }),
    );
  });

  it('records empty evidence without caching when a search returns nothing', async () => {
    config.searchEnabled = true;
    config.searchMaxQueries = 1;
    searchIsConfigured.mockReturnValue(true);
    search.mockResolvedValue({ provider: null, results: [] });
    mockFreshSourceItems(execute);

    await service.generate({ category: 'tech', force: true });

    expect(cacheSet).not.toHaveBeenCalled();
    const analysisInput = analyzeNewsBrief.mock.calls[0][0] as {
      searchEvidence: NewsBriefSearchEvidence[];
    };
    expect(analysisInput.searchEvidence[0]).toMatchObject({
      provider: null,
      results: [],
    });
    expect(markSuccess).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'tech',
      expect.any(String),
      expect.objectContaining({ searchProvidersUsed: [] }),
    );
  });

  it('rejects an unknown category', async () => {
    await expect(service.generate({ category: 'auto' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(claimGeneration).not.toHaveBeenCalled();
  });

  it('rejects a registered category that is not enabled', async () => {
    config.categories = [];

    await expect(service.generate({ category: 'tech' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(claimGeneration).not.toHaveBeenCalled();
  });

  it('rejects a sources override that references an unregistered source', async () => {
    await expect(
      service.generate({ category: 'tech', sources: ['nope'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(claimGeneration).not.toHaveBeenCalled();
  });

  it('rejects a sources override without an explicit category', async () => {
    await expect(
      service.generate({ sources: ['36kr'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(claimGeneration).not.toHaveBeenCalled();
  });

  it('rejects an invalid date', async () => {
    await expect(
      service.generate({ date: '2026/11/08' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(claimGeneration).not.toHaveBeenCalled();
  });

  it('rejects an invalid period', async () => {
    await expect(service.generate({ period: 'Daily' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(claimGeneration).not.toHaveBeenCalled();
  });

  it('rejects an invalid date on findByDate', async () => {
    await expect(service.findByDate('2026-1-1', 'tech')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findByDate).not.toHaveBeenCalled();
  });
});

describe('NewsBriefService findLatest', () => {
  const findLatest = jest.fn();
  let service: NewsBriefService;

  beforeEach(() => {
    findLatest.mockReset().mockResolvedValue(null);
    service = new NewsBriefService(
      {
        timezone: 'Asia/Shanghai',
        categories: [techProfile],
        knownCategories: listNewsCategoryProfiles(),
      } as never,
      { findLatest } as never,
      {} as never,
      {} as never,
      {} as never,
      { getModel: () => 'test-model' } as never,
      {} as never,
      {} as never,
    );
  });

  it('requires a category', async () => {
    await expect(service.findLatest(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findLatest).not.toHaveBeenCalled();
  });

  it('rejects an unknown category', async () => {
    await expect(service.findLatest('auto')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findLatest).not.toHaveBeenCalled();
  });

  it('defaults to the daily period', async () => {
    findLatest.mockResolvedValue(buildSuccessBrief());

    const response = await service.findLatest('tech');

    expect(findLatest).toHaveBeenCalledWith('tech', 'daily', false);
    expect(response).toMatchObject({
      category: 'tech',
      period: 'daily',
      status: 'success',
      itemCount: 1,
    });
  });

  it('treats an empty period query as daily', async () => {
    findLatest.mockResolvedValue(buildSuccessBrief());

    await service.findLatest('tech', '');

    expect(findLatest).toHaveBeenCalledWith('tech', 'daily', false);
  });

  it('hides debug fields by default and returns them with includeDebug', async () => {
    findLatest.mockResolvedValue(
      buildSuccessBrief({
        rawInputItems: [{ ref: 'abc' }],
        searchEvidence: [],
      }),
    );

    const publicResponse = await service.findLatest('tech');
    expect(publicResponse).not.toHaveProperty('rawInputItems');
    expect(publicResponse).not.toHaveProperty('searchEvidence');

    const debugResponse = await service.findLatest('tech', undefined, true);
    expect(debugResponse).toMatchObject({
      rawInputItems: [{ ref: 'abc' }],
      searchEvidence: [],
    });
  });

  it('normalises generating/failed records with missing arrays', async () => {
    findLatest.mockResolvedValue({
      briefDate: '2026-11-08',
      period: 'daily',
      category: 'tech',
      categoryName: '科技',
      status: 'generating',
      items: undefined,
      highlights: undefined,
      sources: undefined,
      searchProvidersUsed: undefined,
      inputWindow: {
        start: new Date('2026-11-07T00:00:00.000Z'),
        end: new Date('2026-11-08T00:00:00.000Z'),
        lookbackHours: 24,
      },
    });

    const response = await service.findLatest('tech');

    expect(response).toMatchObject({
      status: 'generating',
      items: [],
      itemCount: 0,
      highlights: [],
      sources: [],
      searchProvidersUsed: [],
    });
    expect(response?.inputWindow.start).toBe('2026-11-07T00:00:00.000Z');
  });

  it('returns null when no brief is stored', async () => {
    await expect(service.findLatest('tech')).resolves.toBeNull();
  });
});

const financeProfile = getNewsCategoryProfile('finance') as NewsCategoryProfile;

describe('NewsBriefService findDigest', () => {
  const findByDate = jest.fn();
  let config: Record<string, unknown>;
  let service: NewsBriefService;

  beforeEach(() => {
    config = {
      timezone: 'Asia/Shanghai',
      categories: [financeProfile, techProfile],
      knownCategories: listNewsCategoryProfiles(),
    };
    findByDate.mockReset().mockResolvedValue(null);
    service = new NewsBriefService(
      config as never,
      { findByDate } as never,
      {} as never,
      {} as never,
      {} as never,
      { getModel: () => 'test-model' } as never,
      {} as never,
      {} as never,
    );
  });

  it('defaults to every enabled category, today and the daily period', async () => {
    const digest = await service.findDigest();

    expect(digest.briefDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(digest.categories.map((entry) => entry.category)).toEqual([
      'finance',
      'tech',
    ]);
    expect(findByDate).toHaveBeenCalledTimes(2);
    expect(findByDate).toHaveBeenNthCalledWith(
      1,
      digest.briefDate,
      'daily',
      'finance',
    );
    expect(findByDate).toHaveBeenNthCalledWith(
      2,
      digest.briefDate,
      'daily',
      'tech',
    );
  });

  it('keeps the requested category order and drops duplicates', async () => {
    await service.findDigest('tech, finance,tech');

    expect(findByDate.mock.calls.map((call: unknown[]) => call[2])).toEqual([
      'tech',
      'finance',
    ]);
  });

  it('uses the provided date and period', async () => {
    await service.findDigest('tech', '2026-11-01', 'manual-test');

    expect(findByDate).toHaveBeenCalledWith(
      '2026-11-01',
      'manual-test',
      'tech',
    );
  });

  it('marks a category without a record as missing', async () => {
    const digest = await service.findDigest('tech');

    expect(digest.categories).toEqual([
      {
        category: 'tech',
        categoryName: '科技',
        status: 'missing',
        brief: null,
      },
    ]);
  });

  it('returns the stored brief with its status', async () => {
    findByDate.mockResolvedValue(buildSuccessBrief());

    const digest = await service.findDigest('tech');

    expect(digest.categories[0].status).toBe('success');
    expect(digest.categories[0].brief).toMatchObject({
      category: 'tech',
      status: 'success',
      itemCount: 1,
    });
  });

  it('rejects an unknown category', async () => {
    await expect(service.findDigest('auto')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findByDate).not.toHaveBeenCalled();
  });

  it('rejects a registered category that is not enabled', async () => {
    await expect(service.findDigest('general')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findByDate).not.toHaveBeenCalled();
  });

  it('rejects an invalid date and period', async () => {
    await expect(
      service.findDigest('tech', '2026/11/01'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.findDigest('tech', undefined, 'Daily'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findByDate).not.toHaveBeenCalled();
  });
});

describe('NewsBriefService list', () => {
  const list = jest.fn();
  const pageResult = {
    data: [
      {
        briefDate: '2026-11-08',
        period: 'daily',
        category: 'tech',
        categoryName: '科技',
        status: 'success',
        itemCount: 3,
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
  let service: NewsBriefService;

  beforeEach(() => {
    list.mockReset().mockResolvedValue(pageResult);
    service = new NewsBriefService(
      {
        timezone: 'Asia/Shanghai',
        categories: [techProfile],
        knownCategories: listNewsCategoryProfiles(),
      } as never,
      { list } as never,
      {} as never,
      {} as never,
      {} as never,
      { getModel: () => 'test-model' } as never,
      {} as never,
      {} as never,
    );
  });

  it('returns the repository page and defaults the period to daily', async () => {
    const result = await service.list({
      page: 2,
      limit: 10,
      status: 'success',
    });

    expect(result).toBe(pageResult);
    expect(list).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      category: undefined,
      status: 'success',
      period: 'daily',
    });
  });

  it('passes a normalised known category and custom period through', async () => {
    await service.list({ category: 'tech', period: 'manual-test' });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'tech', period: 'manual-test' }),
    );
  });

  it('rejects an unknown category before querying MongoDB', async () => {
    await expect(service.list({ category: 'auto' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(list).not.toHaveBeenCalled();
  });
});

describe('NewsBriefService deleteByDate', () => {
  const deleteByDate = jest.fn();
  let service: NewsBriefService;

  beforeEach(() => {
    deleteByDate.mockReset().mockResolvedValue({ deletedCount: 0 });
    service = new NewsBriefService(
      {
        timezone: 'Asia/Shanghai',
        categories: [techProfile],
        knownCategories: listNewsCategoryProfiles(),
      } as never,
      { deleteByDate } as never,
      {} as never,
      {} as never,
      {} as never,
      { getModel: () => 'test-model' } as never,
      {} as never,
      {} as never,
    );
  });

  it('requires a category', async () => {
    await expect(service.deleteByDate('2026-11-08')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(deleteByDate).not.toHaveBeenCalled();
  });

  it('rejects an invalid date', async () => {
    await expect(
      service.deleteByDate('2026/11/08', 'tech'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteByDate).not.toHaveBeenCalled();
  });

  it('deletes every period when the period is omitted', async () => {
    deleteByDate.mockResolvedValue({ deletedCount: 2 });

    const result = await service.deleteByDate('2026-11-08', 'tech');

    expect(deleteByDate).toHaveBeenCalledWith('2026-11-08', 'tech', undefined);
    expect(result).toEqual({
      mode: 'date',
      briefDate: '2026-11-08',
      category: 'tech',
      period: null,
      deletedCount: 2,
    });
  });

  it('normalises the period and defaults a missing deletedCount to 0', async () => {
    deleteByDate.mockResolvedValue({});

    const result = await service.deleteByDate(
      '2026-11-08',
      'tech',
      'manual-test',
    );

    expect(deleteByDate).toHaveBeenCalledWith(
      '2026-11-08',
      'tech',
      'manual-test',
    );
    expect(result).toMatchObject({ period: 'manual-test', deletedCount: 0 });
  });

  it('rejects an invalid period and an unknown category', async () => {
    await expect(
      service.deleteByDate('2026-11-08', 'tech', 'Daily'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.deleteByDate('2026-11-08', 'auto'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteByDate).not.toHaveBeenCalled();
  });
});

describe('NewsBriefService deleteHistory', () => {
  const deleteBeforeDate = jest.fn();
  let service: NewsBriefService;

  beforeEach(() => {
    deleteBeforeDate.mockReset().mockResolvedValue({ deletedCount: 3 });
    service = new NewsBriefService(
      {
        timezone: 'Asia/Shanghai',
        categories: [techProfile],
        knownCategories: listNewsCategoryProfiles(),
      } as never,
      { deleteBeforeDate } as never,
      {} as never,
      {} as never,
      {} as never,
      { getModel: () => 'test-model' } as never,
      {} as never,
      {} as never,
    );
  });

  it('rejects olderThan and beforeDate used together', async () => {
    await expect(
      service.deleteHistory({ olderThan: '30d', beforeDate: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteBeforeDate).not.toHaveBeenCalled();
  });

  it('requires olderThan or beforeDate', async () => {
    await expect(service.deleteHistory({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(deleteBeforeDate).not.toHaveBeenCalled();
  });

  it('rejects an invalid olderThan format', async () => {
    await expect(
      service.deleteHistory({ olderThan: 'last month' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteBeforeDate).not.toHaveBeenCalled();
  });

  it('deletes before a given date and reports the beforeDate mode', async () => {
    const result = await service.deleteHistory({ beforeDate: '2026-01-01' });

    expect(deleteBeforeDate).toHaveBeenCalledWith('2026-01-01', undefined);
    expect(result).toEqual({
      mode: 'beforeDate',
      olderThan: null,
      beforeDate: '2026-01-01',
      category: null,
      deletedCount: 3,
    });
  });

  it('computes a cutoff date from olderThan and supports month/year aliases', async () => {
    const result = await service.deleteHistory({ olderThan: '30d' });

    expect(result.mode).toBe('olderThan');
    expect(result.olderThan).toBe('30d');
    expect(result.beforeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(deleteBeforeDate).toHaveBeenCalledWith(result.beforeDate, undefined);

    const month = await service.deleteHistory({ olderThan: 'month' });
    expect(month.mode).toBe('olderThan');
    expect(month.olderThan).toBe('month');
    expect(month.beforeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const year = await service.deleteHistory({ olderThan: '1y' });
    expect(year.mode).toBe('olderThan');
    expect(year.beforeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('validates the optional category and passes it through', async () => {
    await service.deleteHistory({
      beforeDate: '2026-01-01',
      category: 'tech',
    });

    expect(deleteBeforeDate).toHaveBeenCalledWith('2026-01-01', 'tech');

    await expect(
      service.deleteHistory({ beforeDate: '2026-01-01', category: 'auto' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteBeforeDate).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid beforeDate', async () => {
    await expect(
      service.deleteHistory({ beforeDate: '2026/01/01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteBeforeDate).not.toHaveBeenCalled();
  });

  it('defaults a missing deletedCount to 0', async () => {
    deleteBeforeDate.mockResolvedValue({});

    const result = await service.deleteHistory({ beforeDate: '1900-01-01' });

    expect(result.deletedCount).toBe(0);
  });
});
