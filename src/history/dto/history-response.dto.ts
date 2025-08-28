export class HistoryResponseDto {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class SourceStatsDto {
  _id: string;
  count: number;
  latestTimestamp: number;
}

export class StatsResponseDto {
  totalCount: number;
  totalSources: number;
  sources: SourceStatsDto[];
}
