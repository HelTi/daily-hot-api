import { AiAnalysisClient } from './ai-analysis.client';
import { BriefAnalysis } from '../interfaces/daily-brief.interface';

interface ParseAnalysisInternals {
  parseAnalysis(content: string): BriefAnalysis;
}

describe('AiAnalysisClient parseAnalysis', () => {
  const client = new AiAnalysisClient({} as never);
  const parse = (content: string) =>
    (client as unknown as ParseAnalysisInternals).parseAnalysis(content);

  const validAnalysis = {
    summary: '今日核心结论',
    highlights: ['要点一'],
    topics: [{ title: '主题一', event: '发生了什么' }],
    risks: [],
    followUpSignals: [],
    markdown: '# 每日简报',
  };

  it('accepts a complete analysis and applies field defaults', () => {
    const result = parse(JSON.stringify(validAnalysis));

    expect(result.summary).toBe('今日核心结论');
    expect(result.topics).toHaveLength(1);
    // 未提供的字段由 schema 的 .catch() 兜底
    expect(result.topics[0].impactDirection).toBe('待验证');
    expect(result.topics[0].aShareMapping).toEqual([]);
  });

  it('rejects an empty object instead of producing a blank brief', () => {
    expect(() => parse('{}')).toThrow(/without a summary/);
  });

  it('rejects an analysis with a summary but no topics', () => {
    expect(() =>
      parse(JSON.stringify({ ...validAnalysis, topics: [] })),
    ).toThrow(/without any topic/);
  });

  it('rejects a whitespace-only summary', () => {
    expect(() =>
      parse(JSON.stringify({ ...validAnalysis, summary: '   ' })),
    ).toThrow(/without a summary/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parse('not json')).toThrow(/invalid JSON/);
  });
});
