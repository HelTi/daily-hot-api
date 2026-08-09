import { DailyBriefRepository } from './daily-brief.repository';

describe('DailyBriefRepository stock ranking', () => {
  const aggregate = jest.fn();
  const countDocuments = jest.fn();
  let repository: DailyBriefRepository;

  beforeEach(() => {
    aggregate.mockReset();
    countDocuments.mockReset().mockResolvedValue(0);
    repository = new DailyBriefRepository({
      aggregate,
      countDocuments,
    } as never);
  });

  it('builds the history filters and maps aggregation results', async () => {
    aggregate.mockResolvedValue([
      {
        summary: [{ uniqueStocks: 1, totalAppearances: 4 }],
        rankings: [
          {
            company: '待验证',
            code: '600000',
            appearanceCount: 4,
            briefCount: 2,
            firstAppearedDate: '2026-07-01',
            lastAppearedDate: '2026-07-02',
          },
        ],
      },
    ]);
    countDocuments.mockResolvedValue(3);

    const result = await repository.getStockRanking({
      period: 'daily',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      limit: 10,
    });

    const expectedMatch = {
      status: 'success',
      period: 'daily',
      briefDate: { $gte: '2026-07-01', $lte: '2026-07-31' },
    };
    const pipeline = aggregate.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(pipeline[0]).toEqual({ $match: expectedMatch });
    // 简报总数改用 countDocuments，与聚合共用同一份筛选条件
    expect(countDocuments).toHaveBeenCalledWith(expectedMatch);

    const serializedPipeline = JSON.stringify(pipeline);
    expect(serializedPipeline).not.toContain('"$replaceAll"');
    expect(serializedPipeline).not.toContain('"$set"');
    expect(serializedPipeline).toContain('"$addFields"');
    expect(serializedPipeline).toContain('"$reduce"');
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

  it('groups outside of $facet and never repeats the unwind', async () => {
    aggregate.mockResolvedValue([{ summary: [], rankings: [] }]);

    await repository.getStockRanking();

    const pipeline = aggregate.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    // 两轮分组：先按公司名归并，再按归一化后的代码归并
    expect(pipeline.filter((stage) => '$group' in stage)).toHaveLength(2);
    // 两次 unwind 只在展开 topics/aShareMapping 时发生
    expect(pipeline.filter((stage) => '$unwind' in stage)).toHaveLength(2);

    const facetStage = pipeline.find((stage) => '$facet' in stage) as {
      $facet: Record<string, Array<Record<string, unknown>>>;
    };
    expect(Object.keys(facetStage.$facet)).toEqual(['summary', 'rankings']);
    // 两个分支都不再重复 unwind
    expect(JSON.stringify(facetStage.$facet).includes('"$unwind"')).toBe(false);
    // briefIds 只用于算 briefCount，不应出现在返回投影里
    const rankingProjection = facetStage.$facet.rankings.find(
      (stage) => '$project' in stage,
    );
    expect(rankingProjection).toEqual({
      $project: {
        _id: 0,
        company: 1,
        code: 1,
        appearanceCount: 1,
        briefCount: 1,
        firstAppearedDate: 1,
        lastAppearedDate: 1,
      },
    });
  });

  it('returns an empty summary when no brief matches', async () => {
    aggregate.mockResolvedValue([{ summary: [], rankings: [] }]);
    countDocuments.mockResolvedValue(0);

    await expect(repository.getStockRanking()).resolves.toEqual({
      totalBriefs: 0,
      uniqueStocks: 0,
      totalAppearances: 0,
      rankings: [],
    });
  });
});

describe('DailyBriefRepository list', () => {
  const aggregate = jest.fn();
  const countDocuments = jest.fn();
  let repository: DailyBriefRepository;

  beforeEach(() => {
    aggregate.mockReset().mockResolvedValue([]);
    countDocuments.mockReset().mockResolvedValue(0);
    repository = new DailyBriefRepository({
      aggregate,
      countDocuments,
    } as never);
  });

  it('projects only the summary fields and computes topicCount in MongoDB', async () => {
    await repository.list({ page: 2, limit: 5, status: 'success' });

    const pipeline = aggregate.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(pipeline).toEqual([
      { $match: { status: 'success' } },
      { $sort: { briefDate: -1, createdAt: -1 } },
      { $skip: 5 },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          status: 1,
          briefDate: 1,
          period: 1,
          analysis: {
            summary: { $ifNull: ['$analysis.summary', '$$REMOVE'] },
          },
          topicCount: {
            $cond: [
              { $isArray: '$analysis.topics' },
              { $size: '$analysis.topics' },
              '$$REMOVE',
            ],
          },
          updatedAt: 1,
        },
      },
    ]);
    // markdown 和 analysis.topics 不应被读出来
    const serialized = JSON.stringify(pipeline);
    expect(serialized).not.toContain('markdown');
    expect(serialized).not.toContain('rawInputItems');
  });

  it('clamps paging and returns pagination metadata', async () => {
    aggregate.mockResolvedValue([
      {
        status: 'success',
        briefDate: '2026-07-01',
        period: 'daily',
        analysis: { summary: '结论' },
        topicCount: 3,
      },
    ]);
    countDocuments.mockResolvedValue(42);

    const result = await repository.list({ page: 0, limit: 1000 });

    const pipeline = aggregate.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(pipeline[0]).toEqual({ $match: {} });
    expect(pipeline).toContainEqual({ $skip: 0 });
    expect(pipeline).toContainEqual({ $limit: 100 });
    expect(result).toEqual({
      data: [
        {
          status: 'success',
          briefDate: '2026-07-01',
          period: 'daily',
          analysis: { summary: '结论' },
          topicCount: 3,
        },
      ],
      total: 42,
      page: 1,
      limit: 100,
      totalPages: 1,
    });
  });
});
