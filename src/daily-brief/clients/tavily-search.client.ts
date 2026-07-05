import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BriefSearchResult } from '../interfaces/daily-brief.interface';

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

  constructor(private readonly configService: ConfigService) {}

  async search(query: string): Promise<BriefSearchResult[]> {
    const apiKey = this.configService.get<string>('TAVILY_API_KEY');
    if (!apiKey) {
      this.logger.warn('TAVILY_API_KEY is not configured, skipping search');
      return [];
    }

    const maxResults = this.configService.get<number>('TAVILY_MAX_RESULTS', 5);

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
      this.logger.warn(
        `Tavily search error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength
      ? `${value.slice(0, maxLength).trim()}...`
      : value;
  }
}
