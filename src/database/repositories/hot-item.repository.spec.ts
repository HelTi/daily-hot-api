import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { HotItemRepository } from './hot-item.repository';
import { HotItemDocument } from '../schemas/hot-item.schema';
import { HotListItem } from '../../host-lists/interfaces/hot-list.interface';

describe('HotItemRepository.saveHotItems', () => {
  const bulkWrite = jest.fn();
  const repository = new HotItemRepository({
    bulkWrite,
  } as unknown as Model<HotItemDocument>);
  const item = (url: string, title: string): HotListItem => ({
    id: url,
    title,
    url,
    mobileUrl: url,
    timestamp: 123,
  });

  beforeEach(() => bulkWrite.mockReset());

  it('upserts unique URLs in one unordered write without changing old items', async () => {
    bulkWrite.mockResolvedValue({ upsertedCount: 2 });

    const count = await repository.saveHotItems(
      [
        item('https://a.test', 'first'),
        item('https://a.test', 'later'),
        item('https://b.test', 'second'),
      ],
      'demo',
    );

    expect(count).toBe(2);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const [operations, options] = bulkWrite.mock.calls[0];
    // timestamps 只能逐条关闭，见下一条用例
    expect(options).toEqual({ ordered: false });
    expect(operations).toHaveLength(2);
    expect(operations[0].updateOne).toMatchObject({
      filter: { source: 'demo', url: 'https://a.test' },
      update: { $setOnInsert: { title: 'first' } },
      upsert: true,
    });
    expect(operations[0].updateOne.update.$set).toBeUndefined();
  });

  it('disables timestamps per operation so Mongoose adds no conflicting $set', async () => {
    // bulkWrite 的全局 timestamps 选项不生效；漏掉逐条设置会让 Mongoose 注入
    // `$set: { updatedAt }`，与 $setOnInsert 撞成 MongoDB 错误 40，整批写入失败。
    bulkWrite.mockResolvedValue({ upsertedCount: 1 });

    await repository.saveHotItems([item('https://a.test', 'first')], 'demo');

    const [operations] = bulkWrite.mock.calls[0];
    expect(operations[0].updateOne.timestamps).toBe(false);
  });

  it('counts only new documents', async () => {
    bulkWrite.mockResolvedValue({ upsertedCount: 0 });
    await expect(
      repository.saveHotItems([item('https://a.test', 'first')], 'demo'),
    ).resolves.toBe(0);
  });

  it('does not hide non-duplicate bulk write errors', async () => {
    bulkWrite.mockRejectedValue({ writeErrors: [{ code: 121 }] });
    await expect(
      repository.saveHotItems([item('https://a.test', 'first')], 'demo'),
    ).rejects.toMatchObject({ writeErrors: [{ code: 121 }] });
  });

  it('tolerates only concurrent duplicate-key conflicts', async () => {
    bulkWrite.mockRejectedValue({
      writeErrors: [{ code: 11000 }],
      result: { upsertedCount: 1 },
    });
    await expect(
      repository.saveHotItems([item('https://a.test', 'first')], 'demo'),
    ).resolves.toBe(1);
  });
});

describe('HotItemRepository unique index check', () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

  const bootstrap = async (
    indexes: () => Promise<unknown>,
    init = () => Promise.resolve(),
  ) => {
    warn.mockClear();
    log.mockClear();
    const repository = new HotItemRepository({
      init,
      collection: { collectionName: 'hotitems', indexes },
    } as unknown as Model<HotItemDocument>);

    repository.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));
  };

  afterAll(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  it('warns and points at the migration doc when the index is not unique', async () => {
    await bootstrap(() =>
      Promise.resolve([
        { name: '_id_', key: { _id: 1 } },
        { name: 'source_1_url_1', key: { source: 1, url: 1 } },
      ]),
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('docs/operations/hot-item-index-migration.md'),
    );
  });

  it('stays quiet when the unique index is in place', async () => {
    await bootstrap(() =>
      Promise.resolve([
        { name: 'source_1_url_1', key: { source: 1, url: 1 }, unique: true },
      ]),
    );

    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('已就绪'));
  });

  it('reports index creation and read failures without breaking startup', async () => {
    await bootstrap(
      () => Promise.reject(new Error('buffering timed out')),
      () => Promise.reject(new Error('Index options conflict')),
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Index options conflict'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('buffering timed out'),
    );
  });
});

describe('HotItemRepository history queries', () => {
  it('escapes regex input so punctuation is searched literally', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const find = jest.fn().mockReturnValue({ sort });
    const repository = new HotItemRepository({
      find,
      countDocuments: jest.fn().mockResolvedValue(0),
    } as unknown as Model<HotItemDocument>);

    await repository.searchHistory({ keyword: 'a.b(' });
    expect(find).toHaveBeenCalledWith({
      $or: [
        { title: { $regex: 'a\\.b\\(', $options: 'i' } },
        { desc: { $regex: 'a\\.b\\(', $options: 'i' } },
      ],
    });
  });

  it('caches stats until a new item is written', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValue([{ _id: 'demo', count: 1, latestTimestamp: 123 }]);
    const countDocuments = jest.fn().mockResolvedValue(1);
    const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 1 });
    const repository = new HotItemRepository({
      aggregate,
      countDocuments,
      bulkWrite,
    } as unknown as Model<HotItemDocument>);

    await Promise.all([repository.getStats(), repository.getStats()]);
    await repository.getStats();
    expect(aggregate).toHaveBeenCalledTimes(1);

    await repository.saveHotItems(
      [{ id: '2', title: 'second', url: 'https://b.test', mobileUrl: '' }],
      'demo',
    );
    await repository.getStats();
    expect(aggregate).toHaveBeenCalledTimes(2);
  });
});
