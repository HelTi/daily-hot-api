import { Injectable } from '@nestjs/common';
import { DailyBriefConfigService } from '../daily-brief.config';
import { BriefSearchResult } from '../interfaces/daily-brief.interface';
import { SearchProvider } from '../interfaces/search-provider.interface';

interface DeepseekSearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    summary?: string;
    snippet?: string;
    rerank_score?: number;
  }>;
}

@Injectable()
export class DeepseekSearchClient implements SearchProvider {
  readonly name = 'deepseek' as const;

  constructor(private readonly config: DailyBriefConfigService) {}

  isConfigured(): boolean {
    return this.config.deepseekSearchConfigured;
  }

  async search(query: string): Promise<BriefSearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error('DEEPSEEK_SEARCH_API_KEY is not configured');
    }

    // Search API accepts at most 128 Unicode characters per query.
    const searchQuery = Array.from(query.trim()).slice(0, 128).join('');
    if (!searchQuery) return [];

    const response = await fetch('https://api.deepseek.com/v1/tools/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.deepseekSearchApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        count: this.config.deepseekSearchMaxResults,
        need_content: false,
      }),
      signal: AbortSignal.timeout(this.config.deepseekSearchTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek search failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as DeepseekSearchResponse;
    if (!Array.isArray(data.results)) {
      throw new Error('DeepSeek search returned invalid results');
    }

    return data.results
      .filter((item) => item.title && item.url)
      .map((item) => ({
        title: this.truncate(item.title || '', 160),
        url: item.url || '',
        content: this.truncate(item.summary || item.snippet || '', 600),
        score: item.rerank_score,
      }));
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength
      ? `${value.slice(0, maxLength).trim()}...`
      : value;
  }
}
