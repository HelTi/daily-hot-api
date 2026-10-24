import { Injectable } from '@nestjs/common';
import { BriefSearchResult } from '../interfaces/daily-brief.interface';
import { DailyBriefConfigService } from '../daily-brief.config';
import { SearchProvider } from '../interfaces/search-provider.interface';

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
}

@Injectable()
export class TavilySearchClient implements SearchProvider {
  readonly name = 'tavily' as const;

  constructor(private readonly config: DailyBriefConfigService) {}

  isConfigured(): boolean {
    return this.config.tavilyConfigured;
  }

  async search(query: string): Promise<BriefSearchResult[]> {
    const apiKey = this.config.tavilyApiKey;
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY is not configured');
    }

    const maxResults = this.config.tavilyMaxResults;
    const timeoutMs = this.config.tavilyTimeoutMs;

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        max_results: maxResults,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as TavilyResponse;
    if (!Array.isArray(data.results)) {
      throw new Error('Tavily search returned invalid results');
    }
    return data.results
      .filter((item) => item.title && item.url)
      .map((item) => ({
        title: this.truncate(item.title || '', 160),
        url: item.url || '',
        content: this.truncate(item.content || '', 600),
        score: item.score,
      }));
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength
      ? `${value.slice(0, maxLength).trim()}...`
      : value;
  }
}
