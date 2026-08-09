import { CacheService } from './cache.service';

describe('CacheService delByPattern', () => {
  const ping = jest.fn().mockResolvedValue('PONG');
  const del = jest.fn();
  const keys = jest.fn();
  const scanStream = jest.fn();
  let service: CacheService;

  const buildService = () =>
    new CacheService(
      { ping, del, keys, scanStream } as never,
      { get: (_key: string, fallback: unknown) => fallback } as never,
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
    );

  /** 模拟 ioredis 的 scanStream：按批产出 key。 */
  const streamOf = (batches: string[][]): AsyncIterable<string[]> => ({
    async *[Symbol.asyncIterator]() {
      for (const batch of batches) {
        yield await Promise.resolve(batch);
      }
    },
  });

  beforeEach(async () => {
    ping.mockClear();
    del
      .mockReset()
      .mockImplementation((...args: string[]) => Promise.resolve(args.length));
    keys.mockReset();
    scanStream.mockReset();
    service = buildService();
    // 构造函数里的连接探测是异步的
    await Promise.resolve();
  });

  it('scans with the prefix instead of calling KEYS', async () => {
    scanStream.mockReturnValue(streamOf([['a:1', 'a:2']]));

    await service.delByPattern('a:');

    // KEYS 会阻塞整个 Redis 实例，必须不再被调用
    expect(keys).not.toHaveBeenCalled();
    expect(scanStream).toHaveBeenCalledWith({ match: 'a:*', count: 100 });
  });

  it('deletes every batch the scan yields', async () => {
    scanStream.mockReturnValue(
      streamOf([['a:1', 'a:2'], ['a:3'], [], ['a:4']]),
    );

    await service.delByPattern('a:');

    expect(del).toHaveBeenCalledTimes(3);
    expect(del).toHaveBeenNthCalledWith(1, 'a:1', 'a:2');
    expect(del).toHaveBeenNthCalledWith(2, 'a:3');
    expect(del).toHaveBeenNthCalledWith(3, 'a:4');
  });

  it('does not call del when the scan yields nothing', async () => {
    scanStream.mockReturnValue(streamOf([[], []]));

    await service.delByPattern('a:');

    expect(del).not.toHaveBeenCalled();
  });

  it('swallows scan errors instead of breaking the caller', async () => {
    scanStream.mockImplementation(() => {
      throw new Error('redis exploded');
    });

    await expect(service.delByPattern('a:')).resolves.toBeUndefined();
  });
});
