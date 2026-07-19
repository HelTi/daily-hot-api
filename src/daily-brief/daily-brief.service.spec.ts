import { BadRequestException } from '@nestjs/common';
import { DailyBriefService } from './daily-brief.service';

describe('DailyBriefService stock ranking', () => {
  const getStockRanking = jest.fn();
  let service: DailyBriefService;

  beforeEach(() => {
    getStockRanking.mockReset();
    service = new DailyBriefService(
      undefined,
      { getStockRanking } as never,
      undefined,
      undefined,
      undefined,
      undefined,
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
