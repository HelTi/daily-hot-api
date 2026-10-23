import { AxiosError } from 'axios';
import { of, Subject, throwError } from 'rxjs';
import { HttpClientService } from './http.service';

describe('HttpClientService cache behavior', () => {
  const get = jest.fn();
  const post = jest.fn();
  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  const cacheDel = jest.fn();
  const client = new HttpClientService(
    { get, post } as never,
    { get: cacheGet, set: cacheSet, del: cacheDel } as never,
    { getOrThrow: () => 6000 } as never,
  );

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    cacheGet.mockReset().mockResolvedValue(null);
    cacheSet.mockReset().mockResolvedValue(undefined);
    cacheDel.mockReset().mockResolvedValue(undefined);
  });

  it('uses distinct cache keys for different query parameters', async () => {
    get.mockReturnValue(of({ data: { ok: true } }));
    await client.get({ url: 'https://example.test/list', params: { page: 1 } });
    await client.get({ url: 'https://example.test/list', params: { page: 2 } });

    const keys = cacheSet.mock.calls.map((call) => call[0] as string);
    expect(keys[0]).toMatch(/^http:[a-f0-9]{64}$/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('keeps the previous cache entry when a forced refresh fails', async () => {
    const error = new AxiosError('unavailable', 'ERR_BAD_RESPONSE');
    get.mockReturnValue(throwError(() => error));

    await expect(
      client.get({
        url: 'https://example.test/list',
        noCache: true,
        retries: 0,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(cacheDel).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('coalesces simultaneous requests for the same resource', async () => {
    // HttpService returns an Observable; defer its response until both callers arrive.
    const response = new Subject<unknown>();
    get.mockReturnValue(response.asObservable());

    const first = client.get({ url: 'https://example.test/list' });
    const second = client.get({ url: 'https://example.test/list' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(get).toHaveBeenCalledTimes(1);
    response.next({ data: { ok: true } });
    response.complete();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ data: { ok: true } }),
      expect.objectContaining({ data: { ok: true } }),
    ]);
  });
});
