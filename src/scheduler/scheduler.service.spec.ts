import { SchedulerService } from './scheduler.service';

describe('SchedulerService', () => {
  it('fetches only due sources on cron and keeps runtime state on reconfigure', async () => {
    const now = Date.now();
    const executeBatch = jest.fn().mockResolvedValue([]);
    const jobs = new Map<string, unknown>();
    const registry = {
      doesExist: (_kind: string, name: string) => jobs.has(name),
      addCronJob: (name: string, job: unknown) => jobs.set(name, job),
      deleteCronJob: (name: string) => {
        (jobs.get(name) as { stop: () => void } | undefined)?.stop();
        jobs.delete(name);
      },
      getCronJobs: () => jobs,
    };
    const config = {
      get: (key: string) => {
        if (key === 'SCHEDULER_AUTO_START') return false;
        if (key === 'SCHEDULER_CRON_EXPRESSION') return '0 */12 * * *';
        if (key === 'IGNORE_SAVE_SOURCES') return 'ignored';
        return undefined;
      },
    };
    const service = new SchedulerService(
      registry as never,
      config as never,
      { getAllSources: () => ['due', 'new'] } as never,
      {
        initializeConfigs: jest.fn().mockResolvedValue(undefined),
        findEnabled: jest.fn().mockResolvedValue([
          { source: 'fresh', interval: 30, lastFetchAt: new Date(now - 1_000) },
          {
            source: 'due',
            interval: 30,
            lastFetchAt: new Date(now - 31 * 60_000),
          },
          { source: 'new', interval: 30 },
          { source: 'ignored', interval: 30 },
        ]),
      } as never,
      { executeBatch } as never,
    );

    service.start();
    service.reconfigureCron();
    expect(service.getStatus().schedulerEnabled).toBe(true);
    await service.handleCron();
    expect(executeBatch).toHaveBeenCalledWith(['due', 'new']);
    service.stop();
  });

  it('returns a run ID before a manual fetch completes', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const executeBatch = jest.fn(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const service = new SchedulerService(
      {} as never,
      { get: () => undefined } as never,
      { getAllSources: () => ['demo'] } as never,
      {} as never,
      { executeBatch } as never,
    );

    const run = await service.triggerFetch('demo');
    expect(run.runId).toEqual(expect.any(String));
    expect(service.getRun(run.runId).status).toBe('running');
    expect(executeBatch).toHaveBeenCalledWith(['demo']);

    finish([
      { sourceName: 'demo', success: true, items: [{ title: 'secret' }] },
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.getRun(run.runId)).toMatchObject({
      status: 'completed',
      results: [{ sourceName: 'demo', success: true }],
    });
    expect(service.getRun(run.runId).results?.[0]).not.toHaveProperty('items');
  });
});
