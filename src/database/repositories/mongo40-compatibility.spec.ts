import { DailyBriefRepository } from './daily-brief.repository';

/**
 * 部署目标是 MongoDB 4.0，这里守住聚合管道不引入 4.2+ 才提供的算子。
 * 之前出现过因为用了 `$set` / `$replaceAll` 导致线上报错的情况。
 */

// 4.2 新增
const STAGES_4_2 = ['$set', '$unset', '$replaceWith', '$merge'];
const EXPRS_4_2 = [
  '$replaceAll',
  '$replaceOne',
  '$regexFind',
  '$regexFindAll',
  '$regexMatch',
  '$round',
];
// 4.4 新增
const STAGES_4_4 = ['$unionWith', '$planCacheStats'];
const EXPRS_4_4 = ['$accumulator', '$function', '$isNumber', '$binarySize'];
// 5.0+ 新增
const STAGES_5_PLUS = ['$setWindowFields', '$densify', '$fill', '$documents'];
const EXPRS_5_PLUS = [
  '$dateAdd',
  '$dateSubtract',
  '$dateDiff',
  '$dateTrunc',
  '$getField',
  '$setField',
  '$rand',
  '$sortArray',
  '$maxN',
  '$minN',
  '$firstN',
  '$lastN',
  '$median',
  '$percentile',
];

const FORBIDDEN = [
  ...STAGES_4_2,
  ...EXPRS_4_2,
  ...STAGES_4_4,
  ...EXPRS_4_4,
  ...STAGES_5_PLUS,
  ...EXPRS_5_PLUS,
];

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

describe('daily brief aggregation pipelines stay MongoDB 4.0 compatible', () => {
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

  it('only uses operators available in MongoDB 4.0', () => {
    // 4.0 及更早版本即可用的算子白名单（含 $trim / $convert，二者正是 4.0 引入）
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
      '$toUpper',
      // 股票代码归一化与两轮分组（均为 3.2/3.4 引入，4.0 可用）
      '$let',
      '$filter',
      '$push',
      '$and',
      '$eq',
      '$arrayElemAt',
      '$substrCP',
      '$strLenCP',
      '$setUnion',
    ]);

    const used = new Set(
      capturedPipelines.flatMap((pipeline) => [...collectOperators(pipeline)]),
    );
    const unexpected = [...used].filter((operator) => !allowed.has(operator));
    expect(unexpected).toEqual([]);
  });
});
