import { Injectable, Logger } from '@nestjs/common';
import { BriefSearchResult } from '../interfaces/daily-brief.interface';
import { DailyBriefConfigService } from '../daily-brief.config';

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
}

@Injectable()
export class TavilySearchClient {
  private readonly logger = new Logger(TavilySearchClient.name);

  constructor(private readonly config: DailyBriefConfigService) {}

  async search(query: string): Promise<BriefSearchResult[]> {
    const apiKey = this.config.tavilyApiKey;
    if (!apiKey) {
      this.logger.warn('TAVILY_API_KEY is not configured, skipping search');
      return [];
    }

    const maxResults = this.config.tavilyMaxResults;
    const timeoutMs = this.config.tavilyTimeoutMs;

    try {
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
        this.logger.warn(
          `Tavily search failed: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const data = (await response.json()) as TavilyResponse;
      return (data.results || [])
        .filter((item) => item.title && item.url)
        .map((item) => ({
          title: this.truncate(item.title || '', 160),
          url: item.url || '',
          content: this.truncate(item.content || '', 600),
          score: item.score,
        }));
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      this.logger.warn(`Tavily search error: ${reason}`);
      return [];
    }
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength
      ? `${value.slice(0, maxLength).trim()}...`
      : value;
  }
}
