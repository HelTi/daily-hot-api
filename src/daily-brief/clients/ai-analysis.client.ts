import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';
import {
  BriefAnalysis,
  BriefInputItem,
  BriefSearchEvidence,
} from '../interfaces/daily-brief.interface';
import { DailyBriefConfigService } from '../daily-brief.config';

/**
 * 提示词预算：进入模型的热点条目和搜索证据上限。
 * 候选主题的选取也按 `maxTopics` 截断，避免为进不了提示词的主题付费；
 * `BRIEF_MAX_TOPICS` 的校验上限与 `maxTopics` 对齐，配置超限会在启动时报错。
 */
export const PROMPT_BUDGET = {
  maxHotItems: 60,
  maxTopics: 12,
} as const;

const stringArraySchema = z.array(z.string()).catch([]);

const briefTopicSchema = z
  .object({
    title: z.string().catch(''),
    event: z.string().catch(''),
    importance: z.string().catch(''),
    impactDirection: z.enum(['利好', '利空', '中性', '待验证']).catch('待验证'),
    impactHorizon: z.enum(['短期', '中期', '长期']).catch('中期'),
    confidence: z.coerce.number().min(0).max(1).catch(0.5),
    industryChain: z
      .object({
        upstream: stringArraySchema,
        midstream: stringArraySchema,
        downstream: stringArraySchema,
        bottlenecks: stringArraySchema,
      })
      .catch({
        upstream: [],
        midstream: [],
        downstream: [],
        bottlenecks: [],
      }),
    aShareMapping: z
      .array(
        z.object({
          company: z.string().catch('待验证'),
          code: z.string().optional().catch(undefined),
          logic: z.string().catch(''),
          relationType: z
            .enum(['直接受益', '间接受益', '题材映射', '承压', '待验证'])
            .catch('待验证'),
        }),
      )
      .catch([]),
    risks: stringArraySchema,
    followUpSignals: stringArraySchema,
    sourceUrls: stringArraySchema,
  })
  .strip();

const briefAnalysisSchema = z
  .object({
    summary: z.string().catch(''),
    highlights: stringArraySchema,
    topics: z.array(briefTopicSchema).catch([]),
    risks: stringArraySchema,
    followUpSignals: stringArraySchema,
    markdown: z.string().catch(''),
  })
  .strip();

export interface AnalyzeDailyBriefInput {
  briefDate: string;
  sources: string[];
  items: BriefInputItem[];
  searchEvidence: BriefSearchEvidence[];
}

/**
 * 内容层的最大请求次数（含首次请求）。
 *
 * `AI_MAX_RETRIES` 只覆盖 SDK 的 HTTP 层重试；实测 DeepSeek 在简报这种大结构化
 * 输出下会偶发返回坏 JSON（例如在 highlights 之后提前闭合根对象），这属于内容层
 * 失败，SDK 不会重试。这里重新请求一次的成本远低于当天简报直接失败。
 */
export const ANALYSIS_PARSE_ATTEMPTS = 3;

@Injectable()
export class AiAnalysisClient {
  private readonly logger = new Logger(AiAnalysisClient.name);

  constructor(private readonly config: DailyBriefConfigService) {}

  async analyzeDailyBrief(
    input: AnalyzeDailyBriefInput,
  ): Promise<BriefAnalysis> {
    const apiKey = this.config.openaiApiKey;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = this.getModel();
    const isDeepseek = this.config.openaiBaseUrl
      ? new URL(this.config.openaiBaseUrl).hostname === 'api.deepseek.com'
      : false;
    const client = new OpenAI({
      apiKey,
      baseURL: this.config.openaiBaseUrl,
      // SDK 默认是 10 分钟超时 + 2 次重试，最坏情况会把整次简报生成挂住半小时
      timeout: this.config.aiTimeoutMs,
      maxRetries: this.config.aiMaxRetries,
    });

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= ANALYSIS_PARSE_ATTEMPTS; attempt++) {
      const content = await this.requestAnalysis(
        client,
        model,
        isDeepseek,
        input,
      );
      if (!content) {
        lastError = new Error('AI returned empty content');
      } else {
        try {
          return this.parseAnalysis(content);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      this.logger.warn(
        `Daily brief AI response rejected (attempt ${attempt}/${ANALYSIS_PARSE_ATTEMPTS}): ${lastError.message}`,
      );
    }

    throw lastError ?? new Error('AI analysis failed before returning content');
  }

  private async requestAnalysis(
    client: OpenAI,
    model: string,
    isDeepseek: boolean,
    input: AnalyzeDailyBriefInput,
  ): Promise<string | undefined> {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      // DeepSeek 默认开启思考模式；实测复杂简报在 JSON 模式下仍会返回无效 JSON。
      // 对结构化生成关闭思考，并留足输出空间。其他兼容端点不接收 DeepSeek 专属字段。
      ...(isDeepseek
        ? { thinking: { type: 'disabled' as const }, max_tokens: 16384 }
        : {}),
      messages: [
        {
          role: 'system',
          content: [
            '你是一个面向中文投资者和产业研究人员的每日热点简报分析师。',
            '你的任务不是复述新闻，而是识别重要事件、拆解产业链、关联A股公司，并给出风险与跟踪信号。',
            '必须谨慎处理A股公司和股票代码：只有在输入材料或搜索证据支持时才给出，无法确认就标记为待验证。',
            '只输出合法JSON，不要输出Markdown围栏。',
            'JSON示例：{"summary":"今日结论","highlights":[],"topics":[{"title":"主题","event":"事件"}],"risks":[],"followUpSignals":[],"markdown":"# 每日简报"}。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction: this.getJsonSchemaInstruction(),
            briefDate: input.briefDate,
            sources: input.sources,
            hotItems: input.items
              .slice(0, PROMPT_BUDGET.maxHotItems)
              .map((item) => ({
                ...item,
                title: this.truncate(item.title, 160),
                desc: this.truncate(item.desc ?? '', 280),
                url: this.truncate(item.url, 500),
                mobileUrl: this.truncate(item.mobileUrl ?? '', 500),
              })),
            searchEvidence: input.searchEvidence
              .slice(0, PROMPT_BUDGET.maxTopics)
              .map((item) => ({
                topicTitle: this.truncate(item.topicTitle, 160),
                query: this.truncate(item.query, 280),
                results: item.results.slice(0, 3).map((result) => ({
                  ...result,
                  title: this.truncate(result.title, 160),
                  url: this.truncate(result.url, 500),
                  content: this.truncate(result.content ?? '', 300),
                })),
              })),
          }),
        },
      ],
    });

    return completion.choices[0]?.message?.content ?? undefined;
  }

  getModel(): string {
    return this.config.aiModel;
  }

  private truncate(value: string, limit: number): string {
    return value.length > limit ? value.slice(0, limit) : value;
  }

  private getJsonSchemaInstruction() {
    return {
      outputLanguage: 'zh-CN',
      requiredJsonShape: {
        summary: 'string，今日核心结论，3-5句话',
        highlights: ['string，最重要的3-8条要点'],
        topics: [
          {
            title: 'string，主题标题',
            event: 'string，发生了什么',
            importance: 'string，为什么重要',
            impactDirection: '利好|利空|中性|待验证',
            impactHorizon: '短期|中期|长期',
            confidence: 'number，0-1',
            industryChain: {
              upstream: ['string'],
              midstream: ['string'],
              downstream: ['string'],
              bottlenecks: ['string'],
            },
            aShareMapping: [
              {
                company: 'string，公司名',
                code: 'string，可选，股票代码',
                logic: 'string，关联逻辑',
                relationType: '直接受益|间接受益|题材映射|承压|待验证',
              },
            ],
            risks: ['string'],
            followUpSignals: ['string'],
            sourceUrls: ['string'],
          },
        ],
        risks: ['string，整份简报层面的风险提示'],
        followUpSignals: ['string，后续需要观察的指标或事件'],
        markdown: 'string，可直接展示的Markdown简报',
      },
    };
  }

  private parseAnalysis(content: string): BriefAnalysis {
    const parsedContent = this.parseJsonContent(content);

    const result = briefAnalysisSchema.safeParse(parsedContent);
    if (!result.success) {
      throw new Error(
        `AI returned invalid brief analysis structure: ${result.error.message}`,
      );
    }

    // schema 里每个字段都带 .catch()，`{}` 之类的响应同样会解析成功。
    // 没有这层校验，一份空简报会被当成生成成功写库。
    const analysis = result.data as BriefAnalysis;
    if (!analysis.summary.trim()) {
      throw new Error('AI returned a brief analysis without a summary');
    }
    if (analysis.topics.length === 0) {
      throw new Error('AI returned a brief analysis without any topic');
    }

    return analysis;
  }

  /**
   * 解析模型返回的 JSON，并容忍几类常见的格式坏掉：
   * 1. 直接解析原文（原文是合法 JSON 时走这里）；
   * 2. 去掉 Markdown 代码围栏后再解析；
   * 3. 修复“提前闭合根对象”的坏 JSON；
   * 4. 从前后混有说明文字的内容里截取第一个完整 JSON 值。
   *
   * 任何一种候选文本能 JSON.parse 就采用。全部失败时抛出 `AI returned invalid
   * JSON`，由 `analyzeDailyBrief` 决定是否重新请求模型。
   */
  private parseJsonContent(content: string): unknown {
    const base = this.stripCodeFence(content).trim();
    const candidates = [
      base,
      this.repairPrematureRootClose(base),
      this.extractFirstJsonValue(base),
    ];

    let lastError: Error | undefined;
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        return JSON.parse(candidate);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(
      `AI returned invalid JSON: ${lastError?.message ?? 'empty response'}`,
    );
  }

  /** 模型偶尔会返回 ```json ... ``` 围栏，去掉后再解析。 */
  private stripCodeFence(content: string): string {
    const trimmed = content.trim();
    const fenced = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```\s*$/.exec(trimmed);
    return fenced ? fenced[1].trim() : trimmed;
  }

  /**
   * 修复模型偶发的“提前闭合根对象”：`{"summary":..,"highlights":[..]},"topics":[..]}`。
   *
   * 只在多余闭合符后面紧跟 `,"key"`（明显是继续写对象成员）时才删除，
   * 避免把“完整 JSON + 后续说明文字”误当成可修复结构。
   */
  private repairPrematureRootClose(content: string): string | null {
    const rootCloseIndex = this.findRootCloseIndex(content);
    if (rootCloseIndex < 0) return null;

    const rest = content.slice(rootCloseIndex + 1).trimStart();
    if (!/^,\s*"/.test(rest)) return null;

    return content.slice(0, rootCloseIndex) + content.slice(rootCloseIndex + 1);
  }

  /**
   * 返回从 `start` 开始扫描时第一个让括号深度归零的下标；字符串内的括号不计入。
   * 内容不完整（括号未闭合）时返回 -1。
   */
  private findRootCloseIndex(content: string, start = 0): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < content.length; index++) {
      const char = content[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        if (depth === 0) return index;
      }
    }

    return -1;
  }

  /** 截取第一个完整的 JSON 值（对象或数组），允许前后有说明文字。 */
  private extractFirstJsonValue(content: string): string | null {
    const start = content.search(/[{[]/);
    if (start < 0) return null;

    const end = this.findRootCloseIndex(content, start);
    if (end < 0) return null;

    return content.slice(start, end + 1);
  }
}
