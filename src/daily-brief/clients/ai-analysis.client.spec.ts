import { AiAnalysisClient } from './ai-analysis.client';
import { BriefAnalysis } from '../interfaces/daily-brief.interface';

const mockCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args: unknown[]): Promise<unknown> =>
          mockCreate(...args) as Promise<unknown>,
      },
    },
  })),
}));

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

describe('AiAnalysisClient DeepSeek JSON request', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: '结论',
              topics: [{ title: '主题' }],
            }),
          },
        },
      ],
    });
  });

  it.each([
    ['https://api.deepseek.com', true],
    ['https://example.test/v1', false],
  ])('sets DeepSeek-only JSON options for %s', async (baseUrl, isDeepseek) => {
    const client = new AiAnalysisClient({
      openaiApiKey: 'sk-test',
      openaiBaseUrl: baseUrl,
      aiTimeoutMs: 1000,
      aiMaxRetries: 0,
      aiModel: 'test-model',
    } as never);

    await client.analyzeDailyBrief({
      briefDate: '2026-10-24',
      sources: ['cls'],
      items: [],
      searchEvidence: [],
    });

    const request = mockCreate.mock.calls[0][0] as {
      thinking?: { type: string };
      max_tokens?: number;
      response_format: { type: string };
    };
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.thinking).toEqual(
      isDeepseek ? { type: 'disabled' } : undefined,
    );
    expect(request.max_tokens).toBe(isDeepseek ? 16384 : undefined);
  });
});
