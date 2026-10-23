import { FetchHotDataTask } from './fetch-hot-data.task';

describe('FetchHotDataTask coordination', () => {
  it('shares same-source work and caps concurrency across calls', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const resolvers = new Map<string, (value: unknown) => void>();
    const fetchSource = jest.fn(
      (source: string) =>
        new Promise((resolve) => resolvers.set(source, resolve)),
    );
    const task = new FetchHotDataTask(
      { getAllSources: () => names, fetchSource } as never,
      { saveHotItems: jest.fn().mockResolvedValue(1) } as never,
      {
        findBySource: jest.fn().mockResolvedValue({ enabled: true }),
        updateLastFetchTime: jest.fn().mockResolvedValue(undefined),
      } as never,
      { get: () => '' } as never,
    );

    const first = task.execute('a');
    expect(task.execute('a')).toBe(first);
    const batch = task.executeBatch(names);
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchSource).toHaveBeenCalledTimes(5);

    resolvers.get('a')?.({ data: [{ title: 'A', url: 'https://a.test' }] });
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchSource).toHaveBeenCalledTimes(6);

    for (const name of names.slice(1)) {
      resolvers.get(name)?.({
        data: [{ title: name, url: `https://${name}.test` }],
      });
    }
    const results = await batch;
    expect(results).toHaveLength(6);
    expect(results.every((result) => result.success)).toBe(true);
  });

  it('waits for in-flight fetches and rejects new work on shutdown', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const task = new FetchHotDataTask(
      {
        getAllSources: () => ['a', 'b'],
        fetchSource: () => new Promise((resolve) => (finish = resolve)),
      } as never,
      { saveHotItems: jest.fn().mockResolvedValue(1) } as never,
      {
        findBySource: jest.fn().mockResolvedValue({ enabled: true }),
        updateLastFetchTime: jest.fn().mockResolvedValue(undefined),
      } as never,
      { get: () => '' } as never,
    );
    const first = task.execute('a');
    await new Promise((resolve) => setImmediate(resolve));
    const draining = task.beforeApplicationShutdown();
    await expect(task.execute('b')).resolves.toMatchObject({
      success: false,
      error: 'Application is shutting down',
    });
    finish({ data: [{ title: 'A', url: 'https://a.test' }] });
    await expect(first).resolves.toMatchObject({ success: true });
    await draining;
  });
});
