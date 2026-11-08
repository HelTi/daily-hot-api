import { Injectable, Logger } from '@nestjs/common';
import { NewsBriefConfigService } from '../news-brief.config';
import {
  SearchOutcome,
  SearchProvider,
  SearchProviderName,
} from '../../daily-brief/interfaces/search-provider.interface';
import { TavilySearchClient } from '../../daily-brief/clients/tavily-search.client';
import { DeepseekSearchClient } from '../../daily-brief/clients/deepseek-search.client';

/**
 * 通用新闻简报的搜索增强。
 *
 * 复用 daily-brief 的两个搜索 client（只依赖它们查询无关的 `search(query)`），
 * 平台顺序和开关来自独立的 `NEWS_BRIEF_SEARCH_*` 配置，与每日简报互不影响。
 */
@Injectable()
export class NewsBriefSearchService {
  private readonly logger = new Logger(NewsBriefSearchService.name);
  private readonly providers: Record<SearchProviderName, SearchProvider>;

  constructor(
    private readonly config: NewsBriefConfigService,
    tavily: TavilySearchClient,
    deepseek: DeepseekSearchClient,
  ) {
    this.providers = { tavily, deepseek };
  }

  /** 至少一个平台配置了密钥才值得发起搜索。 */
  isConfigured(): boolean {
    return this.config.searchProviders.some((name) =>
      this.providers[name]?.isConfigured(),
    );
  }

  async search(query: string): Promise<SearchOutcome> {
    for (const name of this.config.searchProviders) {
      const provider = this.providers[name];
      if (!provider) continue;
      if (!provider.isConfigured()) {
        this.logger.debug(`Search provider ${name} is not configured`);
        continue;
      }

      try {
        const results = await provider.search(query);
        if (results.length > 0) return { provider: name, results };
        this.logger.debug(`Search provider ${name} returned no results`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Search provider ${name} failed: ${reason}`);
      }
    }

    return { provider: null, results: [] };
  }
}
