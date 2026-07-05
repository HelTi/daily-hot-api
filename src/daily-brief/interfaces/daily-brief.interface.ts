export interface BriefInputItem {
  source: string;
  title: string;
  desc?: string;
  hot?: number | string;
  url: string;
  mobileUrl?: string;
  timestamp?: number;
}

export interface BriefSearchResult {
  title: string;
  url: string;
  content?: string;
  score?: number;
}

export interface BriefSearchEvidence {
  topicTitle: string;
  query: string;
  results: BriefSearchResult[];
}

export interface BriefTopic {
  title: string;
  event: string;
  importance: string;
  impactDirection: '利好' | '利空' | '中性' | '待验证';
  impactHorizon: '短期' | '中期' | '长期';
  confidence: number;
  industryChain: {
    upstream: string[];
    midstream: string[];
    downstream: string[];
    bottlenecks: string[];
  };
  aShareMapping: Array<{
    company: string;
    code?: string;
    logic: string;
    relationType: '直接受益' | '间接受益' | '题材映射' | '承压' | '待验证';
  }>;
  risks: string[];
  followUpSignals: string[];
  sourceUrls: string[];
}

export interface BriefAnalysis {
  summary: string;
  highlights: string[];
  topics: BriefTopic[];
  risks: string[];
  followUpSignals: string[];
  markdown: string;
}

export interface GenerateBriefOptions {
  date?: string;
  period?: string;
  sources?: string[];
  force?: boolean;
}
