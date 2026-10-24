import { DailyBriefRepository } from './daily-brief.repository';
import { HotItemRepository } from './hot-item.repository';

/**
 * 部署目标是 MongoDB 6.0（服务器与本机均为 6.0），这里守住聚合管道不引入
 * 7.0 及以后才提供的算子。另外用白名单兜底：任何未登记的算子都会让测试失败，
 * 逼迫改动者确认该算子在 6.0 可用——历史上就出现过用了当时还不可用的
 * `$set` / `$replaceAll` 导致线上报错的情况。
 *
 * 升级目标版本时，把下面的 FORBIDDEN 换成新目标版本之后才引入的算子，
 * 并把新可用的算子按需加进各自白名单。
 */

// 7.0 新增
const STAGES_7_0 = ['$listSearchIndexes', '$shardedDataDistribution'];
const EXPRS_7_0 = ['$median', '$percentile'];
// 8.0 新增
const STAGES_8_0 = ['$querySettings', '$rankFusion', '$scoreFusion'];

const FORBIDDEN = [...STAGES_7_0, ...EXPRS_7_0, ...STAGES_8_0];

/** 收集管道里出现的所有 `$` 开头的键名。 */
const collectOperators = (node: unknown, found = new Set<string>()) => {
  if (Array.isArray(node)) {
    node.forEach((child) => collectOperators(child, found));
    return found;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) {
        found.add(key);
      }
      collectOperators(value, found);
    }
  }
  return found;
};

describe('daily brief aggregation pipelines stay MongoDB 6.0 compatible', () => {
  const capturedPipelines: unknown[][] = [];
  const aggregate = jest.fn((pipeline: unknown[]) => {
    capturedPipelines.push(pipeline);
    return Promise.resolve([{ summary: [], rankings: [] }]);
  });
  const countDocuments = jest.fn().mockResolvedValue(0);

  beforeAll(async () => {
    const repository = new DailyBriefRepository({
      aggregate,
      countDocuments,
    } as never);

    // 覆盖两条管道的全部分支：带筛选和不带筛选
    await repository.getStockRanking({
      period: 'daily',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      limit: 10,
    });
    await repository.getStockRanking();
    await repository.list({ status: 'success', period: 'daily' });
    await repository.list({});
  });

  it('captures both pipelines', () => {
    expect(capturedPipelines).toHaveLength(4);
  });

  it.each(FORBIDDEN)('does not use %s', (operator) => {
    const used = capturedPipelines.flatMap((pipeline) => [
      ...collectOperators(pipeline),
    ]);
    expect(used).not.toContain(operator);
  });

  it('only uses operators available in MongoDB 6.0', () => {
    // 6.0 及更早版本即可用的算子白名单。新增算子时请先确认它在 6.0 已可用。
    const allowed = new Set([
      '$match',
      '$project',
      '$group',
      '$sort',
      '$limit',
      '$skip',
      '$unwind',
      '$addFields',
      '$facet',
      '$sum',
      '$min',
      '$max',
      '$last',
      '$addToSet',
      '$size',
      '$concat',
      '$cond',
      '$ifNull',
      '$in',
      '$not',
      '$ne',
      '$gte',
      '$lte',
      '$isArray',
      '$reduce',
      '$split',
      '$trim',
      '$convert',
      // 6.0 可用（4.2 引入），用于股票代码归一化
      '$replaceAll',
      '$regexFind',
      '$toUpper',
      // 股票代码归一化与两轮分组
      '$let',
      '$filter',
      '$push',
      '$eq',
      '$arrayElemAt',
      '$setUnion',
    ]);

    const used = new Set(
      capturedPipelines.flatMap((pipeline) => [...collectOperators(pipeline)]),
    );
    const unexpected = [...used].filter((operator) => !allowed.has(operator));
    expect(unexpected).toEqual([]);
  });
});

describe('hot item aggregation pipelines stay MongoDB 6.0 compatible', () => {
  it('only uses operators available in MongoDB 6.0', async () => {
    const capturedPipelines: unknown[][] = [];
    const aggregate = jest.fn((pipeline: unknown[]) => {
      capturedPipelines.push(pipeline);
      return Promise.resolve([]);
    });
    const repository = new HotItemRepository({
      aggregate,
      countDocuments: jest.fn().mockResolvedValue(0),
    } as never);

    await repository.getStats();

    expect(capturedPipelines).toHaveLength(1);
    const allowed = new Set(['$group', '$sort', '$sum', '$max']);
    const used = new Set(
      capturedPipelines.flatMap((pipeline) => [...collectOperators(pipeline)]),
    );
    expect([...used].filter((operator) => !allowed.has(operator))).toEqual([]);
    expect(
      [...used].filter((operator) => FORBIDDEN.includes(operator)),
    ).toEqual([]);
  });
});
