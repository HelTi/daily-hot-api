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
    expect(options).toEqual({ ordered: false, timestamps: false });
    expect(operations).toHaveLength(2);
    expect(operations[0].updateOne).toMatchObject({
      filter: { source: 'demo', url: 'https://a.test' },
      update: { $setOnInsert: { title: 'first' } },
      upsert: true,
    });
    expect(operations[0].updateOne.update.$set).toBeUndefined();
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
