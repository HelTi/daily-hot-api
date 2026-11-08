import { NewsBriefSearchService } from './news-brief-search.service';

describe('NewsBriefSearchService', () => {
  const tavily = {
    isConfigured: jest.fn(),
    search: jest.fn(),
  };
  const deepseek = {
    isConfigured: jest.fn(),
    search: jest.fn(),
  };
  const config = { searchProviders: ['tavily', 'deepseek'] };
  let service: NewsBriefSearchService;

  const results = [{ title: '证据标题', url: 'https://example.com/a' }];

  beforeEach(() => {
    tavily.isConfigured.mockReset().mockReturnValue(true);
    deepseek.isConfigured.mockReset().mockReturnValue(true);
    tavily.search.mockReset();
    deepseek.search.mockReset();
    config.searchProviders = ['tavily', 'deepseek'];
    service = new NewsBriefSearchService(
      config as never,
      tavily as never,
      deepseek as never,
    );
  });

  describe('isConfigured', () => {
    it('is true when at least one configured provider has a key', () => {
      expect(service.isConfigured()).toBe(true);

      tavily.isConfigured.mockReturnValue(false);
      expect(service.isConfigured()).toBe(true);

      deepseek.isConfigured.mockReturnValue(false);
      expect(service.isConfigured()).toBe(false);
    });

    it('ignores providers missing from the configured order', () => {
      config.searchProviders = ['bing'];

      expect(service.isConfigured()).toBe(false);
    });

    it('is false when no provider is configured at all', () => {
      config.searchProviders = [];
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('search', () => {
    it('returns the first provider with results and keeps the order', async () => {
      tavily.search.mockResolvedValue(results);

      await expect(service.search('query')).resolves.toEqual({
        provider: 'tavily',
        results,
      });
      expect(deepseek.search).not.toHaveBeenCalled();
    });

    it('skips providers without a key and respects the configured order', async () => {
      config.searchProviders = ['deepseek', 'tavily'];
      deepseek.isConfigured.mockReturnValue(false);
      tavily.search.mockResolvedValue(results);

      await expect(service.search('query')).resolves.toEqual({
        provider: 'tavily',
        results,
      });
      expect(deepseek.search).not.toHaveBeenCalled();
      expect(tavily.search).toHaveBeenCalledWith('query');
    });

    it('falls back to the next provider after an error', async () => {
      const fallback = [{ title: '备用证据', url: 'https://example.com/b' }];
      tavily.search.mockRejectedValue(new Error('HTTP 429'));
      deepseek.search.mockResolvedValue(fallback);

      await expect(service.search('query')).resolves.toEqual({
        provider: 'deepseek',
        results: fallback,
      });
    });

    it('falls back to the next provider after empty results', async () => {
      tavily.search.mockResolvedValue([]);
      deepseek.search.mockResolvedValue(results);

      await expect(service.search('query')).resolves.toEqual({
        provider: 'deepseek',
        results,
      });
    });

    it('returns an empty outcome when every provider fails', async () => {
      tavily.search.mockRejectedValue(new Error('timeout'));
      deepseek.search.mockRejectedValue(new Error('HTTP 401'));

      await expect(service.search('query')).resolves.toEqual({
        provider: null,
        results: [],
      });
    });

    it('skips unknown provider names instead of crashing', async () => {
      config.searchProviders = [
        'bing',
        'tavily',
      ] as unknown as typeof config.searchProviders;
      tavily.search.mockResolvedValue(results);

      await expect(service.search('query')).resolves.toEqual({
        provider: 'tavily',
        results,
      });
    });
  });
});
