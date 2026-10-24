import type { BriefSearchResult } from './daily-brief.interface';

export type SearchProviderName = 'tavily' | 'deepseek';

export interface SearchProvider {
  readonly name: SearchProviderName;
  isConfigured(): boolean;
  search(query: string): Promise<BriefSearchResult[]>;
}

export interface SearchOutcome {
  provider: SearchProviderName | null;
  results: BriefSearchResult[];
}
