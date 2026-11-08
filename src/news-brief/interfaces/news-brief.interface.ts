/**
 * 通用新闻简报的对外/对内契约。
 *
 * 所有板块（财经/综合新闻/科技/体育）返回同一种结构：
 * 简报 -> 条目 -> 来源。板块差异只允许出现在 `extensions`，
 * 基础字段在任何板块都不允许变形。
 */

export type NewsBriefStatus = 'generating' | 'success' | 'failed';

export type NewsBriefGenerationStatus = 'success' | 'failed' | 'skipped';

export type NewsBriefSkipReason =
  | 'already_generated'
  | 'generation_in_progress';

/** 新闻来源：code 用于机器识别，name 用于展示，url 为原文链接。 */
export interface NewsBriefSource {
  code: string;
  name: string;
  url: string;
}

/** 统一新闻条目（服务端归一化后的模型，接口与 DB 共用）。 */
export interface NewsBriefItem {
  /** 稳定 hash：sha256(category|sourceRef) 前 12 位。 */
  id: string;
  title: string;
  summary: string;
  content: string;
  source: NewsBriefSource;
  publishedAt?: string;
  tags?: string[];
  importance?: number;
  /** 板块扩展位；当前没有任何板块写入。 */
  extensions?: Record<string, unknown>;
}

/** AI 实际返回的条目：只有 sourceRef，URL/来源名由服务端回填。 */
export interface NewsBriefAiItem {
  sourceRef: string;
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  importance?: number;
}

/** AI 实际返回的整份 payload。 */
export interface NewsBriefAiPayload {
  title: string;
  summary: string;
  highlights: string[];
  items: NewsBriefAiItem[];
}

/** 服务端校验 + 归一化后的内部模型。 */
export interface NewsBriefAnalysis {
  title: string;
  summary: string;
  highlights: string[];
  items: NewsBriefItem[];
}

/** 构造提示词用的候选条目（ref 由服务端生成，URL 不下发）。 */
export interface NewsBriefInputItem {
  ref: string;
  source: string;
  sourceName: string;
  title: string;
  desc?: string;
  hot?: number | string;
  url: string;
  timestamp?: number;
}

export interface NewsBriefInputWindow {
  start: Date;
  end: Date;
  lookbackHours: number;
}

/** 接口返回的简报（默认前端可见字段）。 */
export interface NewsBriefResponse {
  briefDate: string;
  period: string;
  category: string;
  categoryName: string;
  status: NewsBriefStatus;
  title?: string;
  summary?: string;
  highlights: string[];
  items: NewsBriefItem[];
  itemCount: number;
  sources: string[];
  inputWindow: { start: string; end: string; lookbackHours: number };
  model?: string;
  searchProvidersUsed: string[];
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GenerateNewsBriefOptions {
  category?: string;
  date?: string;
  period?: string;
  force?: boolean;
  /** 仅当 category 明确时允许，用于手工测试单源。 */
  sources?: string[];
}

export interface NewsBriefSuccessResult {
  category: string;
  categoryName: string;
  status: 'success';
  brief: NewsBriefResponse;
}

export interface NewsBriefSkippedResult {
  category: string;
  categoryName: string;
  status: 'skipped';
  reason: NewsBriefSkipReason;
  brief?: NewsBriefResponse;
}

export interface NewsBriefFailedResult {
  category: string;
  categoryName: string;
  status: 'failed';
  error: string;
  /** force 重生成失败且保留了旧成功内容时为 true。 */
  previousBriefRetained?: boolean;
  brief?: NewsBriefResponse;
}

export type NewsBriefGenerationResult =
  | NewsBriefSuccessResult
  | NewsBriefSkippedResult
  | NewsBriefFailedResult;

export interface NewsBriefGenerateResponse {
  briefDate: string;
  period: string;
  results: NewsBriefGenerationResult[];
}

/** 板块 profile（代码内注册，`NEWS_BRIEF_CATEGORIES` 只决定启用哪些）。 */
export interface NewsCategoryProfile {
  code: string;
  name: string;
  description: string;
  focus: string;
  sources: string[];
  maxItems: number;
  /** P1 搜索增强开关；P0 不使用。 */
  search: boolean;
}

/** /config 与 /categories 暴露的板块信息。 */
export interface NewsCategorySummary {
  code: string;
  name: string;
  description: string;
  sources: string[];
  maxItems: number;
}

/** /config 返回的非敏感配置。 */
export interface NewsBriefPublicConfig {
  cronExpression: string;
  timezone: string;
  categories: NewsCategorySummary[];
  lookbackHours: number;
  topItemsPerSource: number;
  maxCandidates: number;
  maxItemsPerCategory: number;
  categoryConcurrency: number;
  sourceConcurrency: number;
  generatingTimeoutMinutes: number;
  manualGenerateEnabled: boolean;
  model: string;
  searchEnabled: boolean;
  searchProviders: string[];
  searchMaxQueries: number;
  searchQueryMaxChars: number;
}

/** P1 搜索增强：为某条候选新闻补充的检索证据（保存到 DB 调试字段）。 */
export interface NewsBriefSearchEvidence {
  ref: string;
  topicTitle: string;
  query: string;
  provider:
    | import('../../daily-brief/interfaces/search-provider.interface').SearchProviderName
    | null;
  results: import('../../daily-brief/interfaces/daily-brief.interface').BriefSearchResult[];
}

/** 分页列表项：不返回 items，只给摘要和条数。 */
export interface NewsBriefListItem {
  briefDate: string;
  period: string;
  category: string;
  categoryName: string;
  status: NewsBriefStatus;
  title?: string;
  summary?: string;
  itemCount: number;
  updatedAt?: Date;
}

export interface NewsBriefListResponse {
  data: NewsBriefListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListNewsBriefsOptions {
  page?: number;
  limit?: number;
  category?: string;
  status?: NewsBriefStatus;
  period?: string;
}

/** digest 读取层的板块状态：missing 表示该日期没有记录（DB 仍只有三种状态）。 */
export type NewsBriefDigestStatus = NewsBriefStatus | 'missing';

export interface NewsBriefDigestCategory {
  category: string;
  categoryName: string;
  status: NewsBriefDigestStatus;
  brief: NewsBriefResponse | null;
}

export interface NewsBriefDigestResponse {
  briefDate: string;
  categories: NewsBriefDigestCategory[];
}

export interface NewsBriefDeleteResponse {
  mode: 'date';
  briefDate: string;
  category: string;
  period: string | null;
  deletedCount: number;
}

export interface NewsBriefDeleteHistoryResponse {
  mode: 'olderThan' | 'beforeDate';
  olderThan: string | null;
  beforeDate: string;
  category: string | null;
  deletedCount: number;
}
