import { Injectable, Logger } from '@nestjs/common';
import { DailyBriefConfigService } from '../daily-brief.config';
import {
  SearchOutcome,
  SearchProvider,
  SearchProviderName,
} from '../interfaces/search-provider.interface';
import { DeepseekSearchClient } from './deepseek-search.client';
import { TavilySearchClient } from './tavily-search.client';

@Injectable()
export class BriefSearchService {
  private readonly logger = new Logger(BriefSearchService.name);
  private readonly providers: Record<SearchProviderName, SearchProvider>;

  constructor(
    private readonly config: DailyBriefConfigService,
    tavily: TavilySearchClient,
    deepseek: DeepseekSearchClient,
  ) {
    this.providers = { tavily, deepseek };
  }

  async search(query: string): Promise<SearchOutcome> {
    for (const name of this.config.searchProviders) {
      const provider = this.providers[name];
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
