import {
  NewsBriefAiClient,
  P1_CONTENT_MAX_CHARS,
} from './news-brief-ai.client';
import {
  NewsBriefInputItem,
  NewsBriefSearchEvidence,
  NewsCategoryProfile,
} from '../interfaces/news-brief.interface';
import { getNewsCategoryProfile } from '../categories/news-category.registry';

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

const techProfile = getNewsCategoryProfile('tech') as NewsCategoryProfile;

const candidate = (
  ref: string,
  overrides: Partial<NewsBriefInputItem> = {},
): NewsBriefInputItem => ({
  ref,
  source: '36kr',
  sourceName: '36氪',
  title: `候选标题-${ref}`,
  desc: `候选描述-${ref}`,
  hot: 100,
  url: `https://example.com/news/${ref}`,
  timestamp: 1700000000000,
  ...overrides,
});

const aiItem = (
  sourceRef: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sourceRef,
  title: 'AI 标题',
  summary: 'AI 摘要',
  content: 'AI 内容',
  tags: ['AI'],
  importance: 80,
  ...overrides,
});

const payload = (
  items: unknown[],
  overrides: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    title: '科技简报',
    summary: '今日科技摘要',
    highlights: ['要点一'],
    items,
    ...overrides,
  });

const buildClient = (overrides: Record<string, unknown> = {}) =>
  new NewsBriefAiClient({
    openaiApiKey: 'sk-test',
    openaiBaseUrl: 'https://api.deepseek.com',
    aiTimeoutMs: 1000,
    aiMaxRetries: 0,
    aiModel: 'test-model',
    ...overrides,
  } as never);

const parse = (
  content: string,
  candidates: NewsBriefInputItem[] = [candidate('ref-a')],
  outputItemCount = 8,
  contentMaxChars = 300,
) =>
  new NewsBriefAiClient({} as never).parseAnalysis(content, {
    category: techProfile,
    candidates: new Map(candidates.map((item) => [item.ref, item])),
    outputItemCount,
    contentMaxChars,
  });

describe('NewsBriefAiClient parseAnalysis', () => {
  it('normalises a valid payload and backfills the source from the candidate', () => {
    const result = parse(
      payload([aiItem('ref-a', { tags: ['AI', '芯片'], importance: 90 })]),
    );

    expect(result.title).toBe('科技简报');
    expect(result.summary).toBe('今日科技摘要');
    expect(result.highlights).toEqual(['要点一']);
    expect(result.items).toHaveLength(1);

    const [item] = result.items;
    // id 由 category + sourceRef 派生，固定 12 位 hash
    expect(item.id).toMatch(/^[0-9a-f]{12}$/);
    // 模型看不到 URL：source 全部由候选回填
    expect(item.source).toEqual({
      code: '36kr',
      name: '36氪',
      url: 'https://example.com/news/ref-a',
    });
    expect(item.title).toBe('AI 标题');
    expect(item.summary).toBe('AI 摘要');
    expect(item.content).toBe('AI 内容');
    expect(item.tags).toEqual(['AI', '芯片']);
    expect(item.importance).toBe(90);
  });

  it('derives a stable id from category and sourceRef', () => {
    const first = parse(payload([aiItem('ref-a')]));
    const second = parse(payload([aiItem('ref-a')]));
    const otherCategory = new NewsBriefAiClient({} as never).parseAnalysis(
      payload([aiItem('ref-a')]),
      {
        category: getNewsCategoryProfile('general') as NewsCategoryProfile,
        candidates: new Map([['ref-a', candidate('ref-a')]]),
        outputItemCount: 8,
        contentMaxChars: 300,
      },
    );

    expect(first.items[0].id).toBe(second.items[0].id);
    expect(otherCategory.items[0].id).not.toBe(first.items[0].id);
  });

  it('normalises second and millisecond timestamps to ISO strings', () => {
    const inSeconds = parse(payload([aiItem('ref-a')]), [
      candidate('ref-a', { timestamp: 1700000000 }),
    ]);
    const inMillis = parse(payload([aiItem('ref-a')]), [
      candidate('ref-a', { timestamp: 1700000000000 }),
    ]);

    expect(inSeconds.items[0].publishedAt).toBe('2023-11-14T22:13:20.000Z');
    expect(inMillis.items[0].publishedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('omits publishedAt when the candidate has no usable timestamp', () => {
    const result = parse(payload([aiItem('ref-a')]), [
      candidate('ref-a', { timestamp: undefined }),
    ]);

    expect(result.items[0]).not.toHaveProperty('publishedAt');
  });

  it('drops items whose sourceRef is not a known candidate', () => {
    const result = parse(payload([aiItem('ref-a'), aiItem('ref-ghost')]));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source.url).toBe('https://example.com/news/ref-a');
  });

  it('throws when no AI item can be normalised', () => {
    expect(() => parse(payload([]))).toThrow(/no valid news items/);
    expect(() => parse(payload([aiItem('ref-ghost')]))).toThrow(
      /no valid news items/,
    );
  });

  it('drops items left empty after normalisation', () => {
    const result = parse(
      payload([
        aiItem('ref-a'),
        // 空 content：无法整理出新闻内容
        aiItem('ref-b', { title: '标题B', content: '   ' }),
        // 空 summary 且空 content：无法从正文回填简介
        aiItem('ref-c', { title: '标题C', summary: '  ', content: '' }),
        // 空 title：没有标题的条目不允许入库
        aiItem('ref-d', { title: '  ', content: '内容D' }),
      ]),
      [
        candidate('ref-a'),
        candidate('ref-b'),
        candidate('ref-c'),
        candidate('ref-d'),
      ],
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source.url).toBe('https://example.com/news/ref-a');
  });

  it('derives the summary from the first sentence when the model omits it', () => {
    const result = parse(
      payload([
        aiItem('ref-a', {
          title: '标题A',
          summary: '',
          content: '第一句。第二句。',
        }),
      ]),
    );

    expect(result.items[0].summary).toBe('第一句。');
  });

  it('drops duplicate sourceRef entries', () => {
    const result = parse(
      payload([aiItem('ref-a'), aiItem('ref-a', { title: '重复条目' })]),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('AI 标题');
  });

  it('drops entries that repeat the same canonical title', () => {
    const result = parse(
      payload([
        aiItem('ref-a', { title: '同一条新闻' }),
        aiItem('ref-b', { title: ' 同一条 新闻 ' }),
      ]),
      [candidate('ref-a'), candidate('ref-b')],
    );

    expect(result.items).toHaveLength(1);
  });

  it('clamps importance to 0-100 and sorts by importance', () => {
    const result = parse(
      payload([
        aiItem('ref-a', { title: '标题A', importance: 10 }),
        aiItem('ref-b', { title: '标题B', importance: 150 }),
        aiItem('ref-c', { title: '标题C', importance: -10 }),
      ]),
      [candidate('ref-a'), candidate('ref-b'), candidate('ref-c')],
    );

    expect(result.items.map((item) => item.importance)).toEqual([100, 10, 0]);
    expect(result.items[0].source.url).toBe('https://example.com/news/ref-b');
  });

  it('truncates over-long title and content', () => {
    const result = parse(
      payload([
        aiItem('ref-a', {
          title: `标${'题'.repeat(200)}`,
          content: '内'.repeat(400),
        }),
      ]),
    );

    const [item] = result.items;
    expect(item.title).toHaveLength(80);
    expect(item.content).toHaveLength(300);
  });

  it('allows the longer P1 content limit when contentMaxChars is 600', () => {
    const result = parse(
      payload([aiItem('ref-a', { content: '内'.repeat(700) })]),
      [candidate('ref-a')],
      8,
      P1_CONTENT_MAX_CHARS,
    );

    expect(result.items[0].content).toHaveLength(600);
  });

  it('limits output items to the requested count', () => {
    const result = parse(
      payload([
        aiItem('ref-a', { title: '标题A', importance: 10 }),
        aiItem('ref-b', { title: '标题B', importance: 90 }),
        aiItem('ref-c', { title: '标题C', importance: 50 }),
      ]),
      [candidate('ref-a'), candidate('ref-b'), candidate('ref-c')],
      2,
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.source.url)).toEqual([
      'https://example.com/news/ref-b',
      'https://example.com/news/ref-c',
    ]);
  });

  it('falls back to highlights for an empty summary and drops payloads without one', () => {
    const withHighlights = parse(
      payload([aiItem('ref-a')], {
        summary: '   ',
        highlights: ['要点A', '要点B'],
      }),
    );
    expect(withHighlights.summary).toBe('要点A；要点B');

    expect(() =>
      parse(payload([aiItem('ref-a')], { summary: '   ', highlights: [] })),
    ).toThrow(/without a summary/);
  });

  it('falls back to the category name for an empty title', () => {
    const result = parse(payload([aiItem('ref-a')], { title: '  ' }));

    expect(result.title).toBe('科技每日简报');
  });

  it('rejects malformed JSON', () => {
    expect(() => parse('not json')).toThrow(/invalid JSON/);
  });
});

describe('NewsBriefAiClient OpenAI request', () => {
  const aiResponse = JSON.stringify({
    title: '科技简报',
    summary: '摘要',
    highlights: ['要点'],
    items: [
      {
        sourceRef: 'ref-a',
        title: '标题',
        summary: '摘要',
        content: '内容',
        importance: 60,
      },
    ],
  });

  const analyze = (
    client: NewsBriefAiClient,
    items = [candidate('ref-a')],
    extra: Record<string, unknown> = {},
  ) =>
    client.analyzeNewsBrief({
      category: techProfile,
      briefDate: '2026-11-08',
      items,
      outputItemCount: 8,
      ...extra,
    });

  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({
      choices: [{ message: { content: aiResponse } }],
    });
  });

  it('sends the DeepSeek thinking/max_tokens flags with a JSON response format', async () => {
    await analyze(buildClient());

    const request = mockCreate.mock.calls[0][0] as {
      model: string;
      temperature: number;
      response_format: { type: string };
      thinking?: { type: string };
      max_tokens?: number;
    };
    expect(request.model).toBe('test-model');
    expect(request.temperature).toBe(0.3);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.max_tokens).toBe(8192);
  });

  it('omits DeepSeek-only flags for other OpenAI-compatible endpoints', async () => {
    await analyze(buildClient({ openaiBaseUrl: 'https://example.test/v1' }));

    const request = mockCreate.mock.calls[0][0] as {
      thinking?: { type: string };
      max_tokens?: number;
    };
    expect(request.thinking).toBeUndefined();
    expect(request.max_tokens).toBeUndefined();
  });

  it('builds the prompt from candidates without leaking URLs', async () => {
    const secretUrl = 'https://secret.example.com/article/1';

    await analyze(buildClient(), [candidate('ref-a', { url: secretUrl })]);

    const request = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = request.messages[0].content;
    const userContent = request.messages[1].content;
    const userPayload = JSON.parse(userContent) as {
      category: { code: string; focus: string };
      briefDate: string;
      candidates: Array<Record<string, unknown>>;
    };

    expect(systemPrompt).toContain('只输出合法 JSON');
    expect(userPayload.category.code).toBe('tech');
    expect(userPayload.category.focus).toBe(techProfile.focus);
    expect(userPayload.briefDate).toBe('2026-11-08');
    expect(userPayload.candidates[0]).toEqual({
      ref: 'ref-a',
      source: '36氪',
      title: '候选标题-ref-a',
      desc: '候选描述-ref-a',
      hot: 100,
      timestamp: 1700000000000,
    });
    // 真实 URL 不能进入提示词：模型只允许引用服务端生成的 ref
    expect(userPayload.candidates[0]).not.toHaveProperty('url');
    expect(userContent).not.toContain(secretUrl);
  });

  it('passes search evidence without leaking result URLs', async () => {
    const evidenceUrl = 'https://evidence.example.com/secret';
    const searchEvidence: NewsBriefSearchEvidence[] = [
      {
        ref: 'ref-a',
        topicTitle: '候选标题-ref-a',
        query: '查询词',
        provider: 'tavily',
        results: [{ title: '证据标题', url: evidenceUrl, content: '证据摘要' }],
      },
    ];

    await analyze(buildClient(), undefined, { searchEvidence });

    const request = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = request.messages[1].content;
    const userPayload = JSON.parse(userContent) as {
      searchEvidence: Array<Record<string, unknown>>;
    };

    expect(userPayload.searchEvidence).toEqual([
      {
        ref: 'ref-a',
        query: '查询词',
        results: [{ title: '证据标题', content: '证据摘要' }],
      },
    ]);
    // 证据 URL 只保留在服务端：模型只拿到标题/摘要
    expect(userPayload.searchEvidence[0]).not.toHaveProperty('url');
    expect(
      (
        userPayload.searchEvidence[0].results as Array<Record<string, unknown>>
      )[0],
    ).not.toHaveProperty('url');
    expect(userContent).not.toContain(evidenceUrl);
  });

  it('limits each evidence block to three results', async () => {
    const searchEvidence: NewsBriefSearchEvidence[] = [
      {
        ref: 'ref-a',
        topicTitle: '候选标题-ref-a',
        query: '查询词',
        provider: 'deepseek',
        results: Array.from({ length: 5 }, (_, index) => ({
          title: `证据-${index}`,
          url: `https://evidence.example.com/${index}`,
          content: `证据摘要-${index}`,
        })),
      },
    ];

    await analyze(buildClient(), undefined, { searchEvidence });

    const request = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(request.messages[1].content) as {
      searchEvidence: Array<{ results: unknown[] }>;
    };

    expect(userPayload.searchEvidence[0].results).toHaveLength(3);
    expect(userPayload.searchEvidence[0].results).toEqual([
      { title: '证据-0', content: '证据摘要-0' },
      { title: '证据-1', content: '证据摘要-1' },
      { title: '证据-2', content: '证据摘要-2' },
    ]);
  });

  it('serialises an empty evidence list when no evidence is given', async () => {
    await analyze(buildClient(), undefined, { searchEvidence: [] });

    const request = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(request.messages[1].content) as {
      searchEvidence: unknown[];
      instruction: {
        contentTarget: string;
        requiredJsonShape: { items: Array<{ content: string }> };
      };
    };

    expect(userPayload.searchEvidence).toEqual([]);
    expect(userPayload.instruction.contentTarget).toContain('300 字以内');
    expect(
      userPayload.instruction.requiredJsonShape.items[0].content,
    ).toContain('300 字以内');
  });

  it('raises the content target and truncates to 600 chars with search enabled', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: '科技简报',
              summary: '摘要',
              highlights: ['要点'],
              items: [
                {
                  sourceRef: 'ref-a',
                  title: '标题',
                  summary: '摘要',
                  content: '内'.repeat(700),
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await analyze(buildClient(), undefined, {
      contentMaxChars: P1_CONTENT_MAX_CHARS,
    });

    const request = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(request.messages[1].content) as {
      instruction: { contentTarget: string };
    };
    expect(userPayload.instruction.contentTarget).toContain('600 字以内');
    expect(result.items[0].content).toHaveLength(600);
  });

  it('rejects generation when OPENAI_API_KEY is missing', async () => {
    await expect(analyze(buildClient({ openaiApiKey: '' }))).rejects.toThrow(
      /OPENAI_API_KEY is not configured/,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty AI completion', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '' } }] });

    await expect(analyze(buildClient())).rejects.toThrow(/empty content/);
  });
});
