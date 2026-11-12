import {
  AiAnalysisClient,
  ANALYSIS_PARSE_ATTEMPTS,
} from './ai-analysis.client';
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

  it('repairs JSON whose root object is closed early after highlights', () => {
    // 线上真实坏响应的结构：highlights 之后提前闭合根对象，然后继续输出 topics。
    const malformed =
      '{"summary":"今日核心结论","highlights":["要点一"]},"topics":[{"title":"主题一","event":"事件"}],"risks":[],"followUpSignals":[],"markdown":"# 每日简报"}';

    const result = parse(malformed);

    expect(result.summary).toBe('今日核心结论');
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].title).toBe('主题一');
  });

  it('accepts JSON wrapped in a markdown code fence', () => {
    const fenced = '```json\n' + JSON.stringify(validAnalysis) + '\n```';

    expect(parse(fenced).summary).toBe('今日核心结论');
  });

  it('ignores explanatory text after a complete JSON object', () => {
    const withProse = JSON.stringify(validAnalysis) + '\n\n以上为今日简报。';

    expect(parse(withProse).topics).toHaveLength(1);
  });

  it('does not silently accept a truncated JSON object', () => {
    expect(() => parse('{"summary":"结论","highlights":["要点一"')).toThrow(
      /invalid JSON/,
    );
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

describe('AiAnalysisClient content-level retries', () => {
  const config = {
    openaiApiKey: 'sk-test',
    openaiBaseUrl: 'https://api.deepseek.com',
    aiTimeoutMs: 1000,
    aiMaxRetries: 0,
    aiModel: 'test-model',
  };

  const input = {
    briefDate: '2026-11-12',
    sources: ['cls'],
    items: [],
    searchEvidence: [],
  };

  const validContent = JSON.stringify({
    summary: '结论',
    topics: [{ title: '主题' }],
  });

  // 无法通过修复恢复的坏响应：没有可截取的 JSON 结构。
  const brokenContent = 'not json';
  // 可以通过“提前闭合修复”恢复的坏响应。
  const repairableContent =
    '{"summary":"结论","highlights":["要点"]},"topics":[{"title":"主题"}],"risks":[],"followUpSignals":[],"markdown":"# 简报"}';

  const respond = (content: string) => ({
    choices: [{ message: { content } }],
  });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('re-requests the model when the response JSON cannot be repaired', async () => {
    mockCreate
      .mockResolvedValueOnce(respond(brokenContent))
      .mockResolvedValueOnce(respond(validContent));

    const client = new AiAnalysisClient(config as never);
    const result = await client.analyzeDailyBrief(input);

    expect(result.summary).toBe('结论');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('retries when the response parses but has no usable content', async () => {
    mockCreate
      .mockResolvedValueOnce(
        respond(JSON.stringify({ summary: '', topics: [] })),
      )
      .mockResolvedValueOnce(respond(validContent));

    const client = new AiAnalysisClient(config as never);
    const result = await client.analyzeDailyBrief(input);

    expect(result.summary).toBe('结论');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('retries when the model returns empty content', async () => {
    mockCreate
      .mockResolvedValueOnce(respond(''))
      .mockResolvedValueOnce(respond(validContent));

    const client = new AiAnalysisClient(config as never);
    const result = await client.analyzeDailyBrief(input);

    expect(result.summary).toBe('结论');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('repairs a repairable response without spending another request', async () => {
    mockCreate.mockResolvedValueOnce(respond(repairableContent));

    const client = new AiAnalysisClient(config as never);
    const result = await client.analyzeDailyBrief(input);

    expect(result.topics).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('rethrows the last parse error after exhausting all attempts', async () => {
    mockCreate.mockResolvedValue(respond(brokenContent));

    const client = new AiAnalysisClient(config as never);

    await expect(client.analyzeDailyBrief(input)).rejects.toThrow(
      /invalid JSON/,
    );
    expect(mockCreate).toHaveBeenCalledTimes(ANALYSIS_PARSE_ATTEMPTS);
  });

  it('does not retry request errors (already handled by the SDK)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('connection reset'));

    const client = new AiAnalysisClient(config as never);

    await expect(client.analyzeDailyBrief(input)).rejects.toThrow(
      /connection reset/,
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
