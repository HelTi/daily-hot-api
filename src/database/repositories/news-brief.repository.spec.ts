import { NewsBriefRepository } from './news-brief.repository';
import type { ClaimNewsBriefData } from './news-brief.repository';

describe('NewsBriefRepository generation fencing', () => {
  const findOneAndUpdate = jest.fn();
  const updateOne = jest.fn();
  const repository = new NewsBriefRepository({
    findOneAndUpdate,
    updateOne,
  } as never);
  const leanResult = (value: unknown) => ({
    lean: () => Promise.resolve(value),
  });
  const staleBefore = new Date('2026-11-08T00:00:00Z');
  const claimData = (): ClaimNewsBriefData => ({
    briefDate: '2026-11-08',
    period: 'daily',
    category: 'tech',
    categoryName: '科技',
    sources: ['36kr'],
    inputWindow: { start: staleBefore, end: staleBefore, lookbackHours: 24 },
    model: 'test-model',
    generationId: 'run-1',
    staleBefore,
  });

  beforeEach(() => {
    findOneAndUpdate.mockReset();
    updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
  });

  it('atomically claims a missing or stale generation per category', async () => {
    findOneAndUpdate.mockReturnValue(
      leanResult({ generationId: 'run-1', status: 'generating' }),
    );

    await expect(repository.claimGeneration(claimData())).resolves.toBe(true);

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({
      briefDate: '2026-11-08',
      period: 'daily',
      category: 'tech',
      $or: expect.arrayContaining([
        { generationHeartbeatAt: { $lt: staleBefore } },
      ]),
    });
    expect(update.$set).toMatchObject({ generationId: 'run-1' });
    expect(update.$set.status).toBeUndefined();
    expect(update.$setOnInsert).toMatchObject({
      status: 'generating',
      categoryName: '科技',
      highlights: [],
      items: [],
      searchProvidersUsed: [],
    });
    expect(options.upsert).toBe(true);
    // 新建或续租一条 generating 记录时不需要额外的状态复位写入
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('resets a previously failed record to generating and clears the old error', async () => {
    findOneAndUpdate.mockReturnValue(
      leanResult({ generationId: 'run-1', status: 'failed' }),
    );

    await expect(repository.claimGeneration(claimData())).resolves.toBe(true);

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({
      briefDate: '2026-11-08',
      period: 'daily',
      category: 'tech',
      generationId: 'run-1',
      status: 'failed',
    });
    expect(update).toEqual({
      $set: { status: 'generating' },
      $unset: { error: 1 },
    });
  });

  it('never rewrites a successful record while regenerating it', async () => {
    findOneAndUpdate.mockReturnValue(
      leanResult({ generationId: 'run-1', status: 'success' }),
    );

    await expect(repository.claimGeneration(claimData())).resolves.toBe(true);

    // force 重生成失败时要原样保留旧成功内容，这里不能把它改成 generating
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('reports a lost claim when another generation holds the document', async () => {
    findOneAndUpdate.mockReturnValue(
      leanResult({ generationId: 'other-run', status: 'generating' }),
    );

    await expect(repository.claimGeneration(claimData())).resolves.toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('treats a duplicate key error as an active generation', async () => {
    findOneAndUpdate.mockImplementation(() => {
      throw Object.assign(new Error('duplicate'), { code: 11000 });
    });

    await expect(repository.claimGeneration(claimData())).resolves.toBe(false);
  });

  it('rethrows unexpected claim errors', async () => {
    findOneAndUpdate.mockImplementation(() => {
      throw Object.assign(new Error('boom'), { code: 99 });
    });

    await expect(repository.claimGeneration(claimData())).rejects.toThrow(
      'boom',
    );
  });
});

describe('NewsBriefRepository markFailed', () => {
  const findOneAndUpdate = jest.fn();
  const repository = new NewsBriefRepository({ findOneAndUpdate } as never);
  const leanResult = (value: unknown) => ({
    lean: () => Promise.resolve(value),
  });

  beforeEach(() => findOneAndUpdate.mockReset());

  it('retains a previous successful brief instead of marking it failed', async () => {
    findOneAndUpdate.mockReturnValueOnce(
      leanResult({ status: 'success', briefDate: '2026-11-08' }),
    );

    await expect(
      repository.markFailed('2026-11-08', 'daily', 'tech', 'run-1', 'boom'),
    ).resolves.toEqual({
      retained: true,
      brief: { status: 'success', briefDate: '2026-11-08' },
    });

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ status: 'success', generationId: 'run-1' });
    expect(update.$set).toBeUndefined();
  });

  it('marks the record failed when there is nothing to retain', async () => {
    findOneAndUpdate
      .mockReturnValueOnce(leanResult(null))
      .mockReturnValueOnce(leanResult({ status: 'failed' }));

    await expect(
      repository.markFailed('2026-11-08', 'daily', 'tech', 'run-1', 'boom'),
    ).resolves.toEqual({ retained: false, brief: { status: 'failed' } });

    const [, update] = findOneAndUpdate.mock.calls[1];
    expect(update.$set).toMatchObject({ status: 'failed', error: 'boom' });
    expect(update.$unset).toMatchObject({ generationId: 1 });
  });
});
