import { DeepseekSearchClient } from './deepseek-search.client';

describe('DeepseekSearchClient', () => {
  const config = {
    deepseekSearchConfigured: true,
    deepseekSearchApiKey: 'sk-test',
    deepseekSearchMaxResults: 5,
    deepseekSearchTimeoutMs: 10000,
  };
  const client = new DeepseekSearchClient(config as never);
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('calls Search API and maps summaries into brief evidence', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              title: '新闻',
              url: 'https://example.com/news',
              summary: '长摘要',
              snippet: '短摘要',
              rerank_score: 2.4,
            },
            { title: '', url: 'https://example.com/invalid' },
          ],
        }),
    } as Response);

    await expect(client.search('搜索词')).resolves.toEqual([
      {
        title: '新闻',
        url: 'https://example.com/news',
        content: '长摘要',
        score: 2.4,
      },
    ]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/tools/search');
    expect(options?.headers).toEqual({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options?.body as string)).toEqual({
      query: '搜索词',
      count: 5,
      need_content: false,
    });
  });

  it('caps queries to the documented 128 Unicode characters', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    } as Response);

    await client.search('😀'.repeat(140));

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      query: string;
    };
    expect(Array.from(body.query)).toHaveLength(128);
  });

  it('rejects HTTP and malformed responses for provider failover', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    await expect(client.search('query')).rejects.toThrow('HTTP 429');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
    await expect(client.search('query')).rejects.toThrow('invalid results');
  });
});
