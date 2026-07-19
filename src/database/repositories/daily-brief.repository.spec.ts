import { DailyBriefRepository } from './daily-brief.repository';

describe('DailyBriefRepository stock ranking', () => {
  const aggregate = jest.fn();
  let repository: DailyBriefRepository;

  beforeEach(() => {
    aggregate.mockReset();
    repository = new DailyBriefRepository({ aggregate } as never);
  });

  it('builds the history filters and maps aggregation results', async () => {
    aggregate.mockResolvedValue([
      {
        briefs: [{ totalBriefs: 3 }],
        summary: [{ uniqueStocks: 1, totalAppearances: 4 }],
        rankings: [
          {
            company: '待验证',
            code: '600000',
            appearanceCount: 4,
            briefIds: ['brief-1', 'brief-2'],
            firstAppearedDate: '2026-07-01',
            lastAppearedDate: '2026-07-02',
          },
        ],
      },
    ]);

    const result = await repository.getStockRanking({
      period: 'daily',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      limit: 10,
    });

    const pipeline = aggregate.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(pipeline[0]).toEqual({
      $match: {
        status: 'success',
        period: 'daily',
        briefDate: { $gte: '2026-07-01', $lte: '2026-07-31' },
      },
    });
    expect(result).toEqual({
      totalBriefs: 3,
      uniqueStocks: 1,
      totalAppearances: 4,
      rankings: [
        {
          company: '600000',
          code: '600000',
          appearanceCount: 4,
          briefCount: 2,
          firstAppearedDate: '2026-07-01',
          lastAppearedDate: '2026-07-02',
        },
      ],
    });
  });

  it('returns an empty summary when no brief matches', async () => {
    aggregate.mockResolvedValue([{ briefs: [], summary: [], rankings: [] }]);

    await expect(repository.getStockRanking()).resolves.toEqual({
      totalBriefs: 0,
      uniqueStocks: 0,
      totalAppearances: 0,
      rankings: [],
    });
  });
});
