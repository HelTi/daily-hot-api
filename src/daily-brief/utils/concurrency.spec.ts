import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 0, 20, 10];
    const result = await mapWithConcurrency(delays, 2, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return index;
    });

    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('never exceeds the configured concurrency', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });

    expect(peak).toBe(3);
  });

  it('handles an empty list and clamps invalid concurrency', async () => {
    await expect(mapWithConcurrency([], 3, jest.fn())).resolves.toEqual([]);
    await expect(
      mapWithConcurrency([1, 2], 0, (value) => Promise.resolve(value * 2)),
    ).resolves.toEqual([2, 4]);
  });
});
