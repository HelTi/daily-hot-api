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

  // 抓取源会带防缓存戳、随机 Cookie 和签名；它们不能参与缓存身份，
  // 否则每次请求都是新键，缓存永不命中。
  const keyOf = async (options: Parameters<typeof client.get>[0]) => {
    cacheSet.mockClear();
    await client.get(options);
    return cacheSet.mock.calls[0][0] as string;
  };

  it('ignores cache-busting query parameters and headers', async () => {
    get.mockReturnValue(of({ data: { ok: true } }));

    const first = await keyOf({
      url: 'https://example.test/list',
      params: {
        limit: '50',
        _t: '1000',
        timestamp: 1000,
        token: 'a',
        sign: 'a',
      },
      headers: {
        Cookie: 'SUB=aaa1000',
        'X-UDID': 'aaa',
        Referer: 'https://example.test',
      },
    });
    const second = await keyOf({
      url: 'https://example.test/list',
      params: {
        limit: '50',
        _t: '2000',
        timestamp: 2000,
        token: 'b',
        sign: 'b',
      },
      headers: {
        Cookie: 'SUB=bbb2000',
        'X-UDID': 'bbb',
        Referer: 'https://example.test',
      },
    });
    const otherReferer = await keyOf({
      url: 'https://example.test/list',
      params: { limit: '50' },
      headers: { Referer: 'https://other.test' },
    });

    expect(first).toBe(second);
    expect(otherReferer).not.toBe(first);
  });

  it('ignores cache-busting fields in the URL and the POST body', async () => {
    get.mockReturnValue(of({ data: { ok: true } }));
    post.mockReturnValue(of({ data: { ok: true } }));

    const signed = await keyOf({
      url: 'https://example.test/rank?rid=0&wts=1000&w_rid=aaa',
    });
    const resigned = await keyOf({
      url: 'https://example.test/rank?rid=0&wts=2000&w_rid=bbb',
    });
    const otherRid = await keyOf({ url: 'https://example.test/rank?rid=1' });
    expect(signed).toBe(resigned);
    expect(otherRid).not.toBe(signed);

    cacheSet.mockClear();
    await client.post({
      url: 'https://example.test/rank',
      data: { partner_id: 'wap', timestamp: 1000 },
    });
    await client.post({
      url: 'https://example.test/rank',
      data: { partner_id: 'wap', timestamp: 2000 },
    });
    const postKeys = cacheSet.mock.calls.map((call) => call[0] as string);
    expect(postKeys[0]).toBe(postKeys[1]);
  });

  it('treats query parameter order as irrelevant', async () => {
    get.mockReturnValue(of({ data: { ok: true } }));

    const ab = await keyOf({ url: 'https://example.test/list?a=1&b=2' });
    const ba = await keyOf({ url: 'https://example.test/list?b=2&a=1' });
    expect(ab).toBe(ba);
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
