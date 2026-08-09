import { BadRequestException } from '@nestjs/common';
import { DailyBriefService } from './daily-brief.service';

describe('DailyBriefService stock ranking', () => {
  const getStockRanking = jest.fn();
  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  const cacheDelByPattern = jest.fn();
  let service: DailyBriefService;

  beforeEach(() => {
    getStockRanking.mockReset();
    cacheGet.mockReset().mockResolvedValue(null);
    cacheSet.mockReset().mockResolvedValue(undefined);
    cacheDelByPattern.mockReset().mockResolvedValue(undefined);
    service = new DailyBriefService(
      { stockRankingCacheTtl: 43200 } as never,
      { getStockRanking } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        get: cacheGet,
        set: cacheSet,
        delByPattern: cacheDelByPattern,
      } as never,
    );
  });

  it('adds sequential ranks and applies the default limit', async () => {
    getStockRanking.mockResolvedValue({
      totalBriefs: 3,
      uniqueStocks: 2,
      totalAppearances: 5,
      rankings: [
        {
          company: '股票甲',
          code: '000001',
          appearanceCount: 3,
          briefCount: 2,
          firstAppearedDate: '2026-07-01',
          lastAppearedDate: '2026-07-03',
        },
        {
          company: '股票乙',
          code: '000002',
          appearanceCount: 2,
          briefCount: 2,
          firstAppearedDate: '2026-07-02',
          lastAppearedDate: '2026-07-03',
        },
      ],
    });

    const result = await service.getStockRanking({ period: 'daily' });

    expect(getStockRanking).toHaveBeenCalledWith({
      period: 'daily',
      limit: 50,
    });
    expect(result.filters).toEqual({
      period: 'daily',
      startDate: null,
      endDate: null,
      limit: 50,
    });
    expect(result.summary).toEqual({
      briefCount: 3,
      uniqueStockCount: 2,
      totalAppearances: 5,
    });
    expect(result.rankings.map((item) => item.rank)).toEqual([1, 2]);
    expect(cacheSet).toHaveBeenCalledWith(
      expect.stringContaining('daily-brief:statistics:stocks:'),
      expect.objectContaining({ data: result }),
      43200,
    );
  });

  it('returns a cached response without querying MongoDB', async () => {
    const cachedResponse = {
      filters: {
        period: 'daily',
        startDate: null,
        endDate: null,
        limit: 20,
      },
      summary: {
        briefCount: 1,
        uniqueStockCount: 1,
        totalAppearances: 1,
      },
      rankings: [],
    };
    cacheGet.mockResolvedValue({
      data: cachedResponse,
      updateTime: '2026-07-19T00:00:00.000Z',
    });

    await expect(
      service.getStockRanking({ period: 'daily', limit: 20 }),
    ).resolves.toEqual(cachedResponse);
    expect(getStockRanking).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('rejects a reversed date range before querying MongoDB', async () => {
    await expect(
      service.getStockRanking({
        startDate: '2026-07-18',
        endDate: '2026-07-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getStockRanking).not.toHaveBeenCalled();
  });
});

describe('DailyBriefService generateBrief', () => {
  const findByDate = jest.fn();
  const upsertGenerating = jest.fn();
  const markSuccess = jest.fn();
  const markFailed = jest.fn();
  const saveHotItems = jest.fn();
  const getDataByTimeRange = jest.fn();
  const getHotList = jest.fn();
  const analyzeDailyBrief = jest.fn();
  const search = jest.fn();
  const cacheDelByPattern = jest.fn();
  let config: Record<string, unknown>;
  let service: DailyBriefService;

  const buildItems = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      title: `${prefix}-标题-${index}`,
      desc: `${prefix}-描述-${index}`,
      hot: 100 - index,
      url: `https://example.com/${prefix}/${index}`,
      mobileUrl: `https://m.example.com/${prefix}/${index}`,
      timestamp: 1700000000000 - index * 1000,
    }));

  beforeEach(() => {
    config = {
      timezone: 'Asia/Shanghai',
      // 配置里默认有 3 个源，用来验证条目上限按请求的源数而不是配置算
      sources: ['cls', 'eastmoney', 'gelonghui'],
      lookbackHours: 24,
      topItemsPerSource: 2,
      maxTopics: 12,
      sourceConcurrency: 3,
      searchConcurrency: 3,
      generatingTimeoutMinutes: 30,
    };
    findByDate.mockReset().mockResolvedValue(null);
    upsertGenerating.mockReset().mockResolvedValue(undefined);
    markSuccess
      .mockReset()
      .mockImplementation((briefDate: string) =>
        Promise.resolve({ briefDate, status: 'success' }),
      );
    markFailed.mockReset().mockResolvedValue(undefined);
    saveHotItems.mockReset().mockResolvedValue(0);
    getDataByTimeRange.mockReset().mockResolvedValue([]);
    getHotList.mockReset().mockResolvedValue({ data: [] });
    analyzeDailyBrief.mockReset().mockResolvedValue({
      summary: '结论',
      highlights: [],
      topics: [],
      risks: [],
      followUpSignals: [],
      markdown: '# 每日简报',
    });
    search.mockReset().mockResolvedValue([]);
    cacheDelByPattern.mockReset().mockResolvedValue(undefined);

    service = new DailyBriefService(
      config as never,
      { findByDate, upsertGenerating, markSuccess, markFailed } as never,
      { saveHotItems, getDataByTimeRange } as never,
      { getHotList } as never,
      { getModel: () => 'test-model', analyzeDailyBrief } as never,
      { search } as never,
      { delByPattern: cacheDelByPattern } as never,
    );
  });

  it('caps input items by the requested source count, not the configured one', async () => {
    // 配置里默认有 3 个源，这里只请求 1 个：上限应为 1 * 2 = 2
    getHotList.mockResolvedValue({ data: buildItems('fetched', 5) });
    getDataByTimeRange.mockResolvedValue(buildItems('history', 5));

    await service.generateBrief({ sources: ['cls'], force: true });

    expect(analyzeDailyBrief).toHaveBeenCalledTimes(1);
    const { items, sources } = analyzeDailyBrief.mock.calls[0][0] as {
      items: unknown[];
      sources: string[];
    };
    expect(sources).toEqual(['cls']);
    expect(items).toHaveLength(2);
  });

  it('rejects a concurrent request while a fresh generation is in flight', async () => {
    findByDate.mockResolvedValue({
      status: 'generating',
      updatedAt: new Date(),
    });

    await expect(service.generateBrief({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(upsertGenerating).not.toHaveBeenCalled();
  });

  it('regenerates when a generating brief is older than the staleness timeout', async () => {
    findByDate.mockResolvedValue({
      status: 'generating',
      updatedAt: new Date(Date.now() - 31 * 60000),
    });
    getHotList.mockResolvedValue({ data: buildItems('fetched', 2) });

    await expect(service.generateBrief({})).resolves.toEqual({
      briefDate: expect.any(String),
      status: 'success',
    });
    expect(upsertGenerating).toHaveBeenCalledTimes(1);
    expect(analyzeDailyBrief).toHaveBeenCalledTimes(1);
  });

  it('treats a generating brief with no updatedAt as stale', async () => {
    findByDate.mockResolvedValue({ status: 'generating' });
    getHotList.mockResolvedValue({ data: buildItems('fetched', 2) });

    await service.generateBrief({});

    expect(analyzeDailyBrief).toHaveBeenCalledTimes(1);
  });

  it('honours a custom staleness timeout', async () => {
    config.generatingTimeoutMinutes = 120;
    findByDate.mockResolvedValue({
      status: 'generating',
      updatedAt: new Date(Date.now() - 31 * 60000),
    });

    await expect(service.generateBrief({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('marks the brief failed when analysis throws', async () => {
    getHotList.mockResolvedValue({ data: buildItems('fetched', 2) });
    analyzeDailyBrief.mockRejectedValue(new Error('AI exploded'));

    await expect(service.generateBrief({ force: true })).rejects.toThrow(
      'AI exploded',
    );
    expect(markFailed).toHaveBeenCalledWith(
      expect.any(String),
      'daily',
      'AI exploded',
    );
  });
});
