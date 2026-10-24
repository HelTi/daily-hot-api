import { BriefSearchService } from './brief-search.service';

describe('BriefSearchService', () => {
  const tavily = {
    isConfigured: jest.fn(),
    search: jest.fn(),
  };
  const deepseek = {
    isConfigured: jest.fn(),
    search: jest.fn(),
  };
  const config = { searchProviders: ['tavily', 'deepseek'] };
  let service: BriefSearchService;

  beforeEach(() => {
    tavily.isConfigured.mockReset().mockReturnValue(true);
    deepseek.isConfigured.mockReset().mockReturnValue(true);
    tavily.search.mockReset();
    deepseek.search.mockReset();
    config.searchProviders = ['tavily', 'deepseek'];
    service = new BriefSearchService(
      config as never,
      tavily as never,
      deepseek as never,
    );
  });

  it('uses the first provider with results', async () => {
    const results = [{ title: 'A', url: 'https://example.com/a' }];
    tavily.search.mockResolvedValue(results);

    await expect(service.search('query')).resolves.toEqual({
      provider: 'tavily',
      results,
    });
    expect(deepseek.search).not.toHaveBeenCalled();
  });

  it('falls back after a provider error or empty results', async () => {
    const results = [{ title: 'B', url: 'https://example.com/b' }];
    tavily.search.mockRejectedValue(new Error('HTTP 429'));
    deepseek.search.mockResolvedValue(results);

    await expect(service.search('query')).resolves.toEqual({
      provider: 'deepseek',
      results,
    });

    tavily.search.mockResolvedValue([]);
    await expect(service.search('query')).resolves.toEqual({
      provider: 'deepseek',
      results,
    });
  });

  it('skips unconfigured providers and respects configured order', async () => {
    config.searchProviders = ['deepseek', 'tavily'];
    deepseek.isConfigured.mockReturnValue(false);
    tavily.search.mockResolvedValue([
      { title: 'A', url: 'https://example.com/a' },
    ]);

    await expect(service.search('query')).resolves.toEqual({
      provider: 'tavily',
      results: [{ title: 'A', url: 'https://example.com/a' }],
    });
    expect(deepseek.search).not.toHaveBeenCalled();
  });

  it('returns no evidence when every provider fails', async () => {
    tavily.search.mockRejectedValue(new Error('timeout'));
    deepseek.search.mockRejectedValue(new Error('HTTP 401'));

    await expect(service.search('query')).resolves.toEqual({
      provider: null,
      results: [],
    });
  });
});
