import { BadRequestException } from '@nestjs/common';
import { DailyBriefService } from './daily-brief.service';

describe('DailyBriefService stock ranking', () => {
  const getStockRanking = jest.fn();
  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  const cacheDelByPattern = jest.fn();
  const configGet = jest.fn();
  let service: DailyBriefService;

  beforeEach(() => {
    getStockRanking.mockReset();
    cacheGet.mockReset().mockResolvedValue(null);
    cacheSet.mockReset().mockResolvedValue(undefined);
    cacheDelByPattern.mockReset().mockResolvedValue(undefined);
    configGet
      .mockReset()
      .mockImplementation(
        (_key: string, defaultValue: unknown) => defaultValue,
      );
    service = new DailyBriefService(
      { get: configGet } as never,
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
