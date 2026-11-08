import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  NewsBriefAiPayload,
  NewsBriefAnalysis,
  NewsBriefInputItem,
  NewsBriefItem,
  NewsBriefSearchEvidence,
  NewsCategoryProfile,
} from '../interfaces/news-brief.interface';
import { NewsBriefConfigService } from '../news-brief.config';

/**
 * 提示词预算：进入模型的内容上限与输出上限。
 * 配置的校验上限与这里对齐，配大了会在启动时报错，而不是静默截断。
 */
export const PROMPT_BUDGET = {
  maxCandidates: 40,
  maxSearchEvidence: 8,
  maxOutputItems: 10,
  maxTitleChars: 160,
  maxDescChars: 280,
  /** 搜索证据进入提示词时单条 query 的长度上限（query 本身最多 2000 字）。 */
  maxEvidenceQueryChars: 200,
  /** 单条搜索结果进入提示词的摘要长度上限。 */
  maxEvidenceContentChars: 300,
  maxEvidenceResults: 3,
} as const;

/** P0 没有搜索证据，content 只做基于标题/摘要的整理，长度更短（80–300 字）。 */
export const P0_CONTENT_MAX_CHARS = 300;
/** P1 搜索增强开启后允许更长内容（80–600 字）。 */
export const P1_CONTENT_MAX_CHARS = 600;

const TITLE_MAX_CHARS = 80;
const SUMMARY_MAX_CHARS = 160;
const TAG_MAX_CHARS = 12;
const TAG_MAX_COUNT = 5;

const stringArraySchema = z.array(z.string()).catch([]);

const aiItemSchema = z
  .object({
    sourceRef: z.string().catch(''),
    title: z.string().catch(''),
    summary: z.string().catch(''),
    content: z.string().catch(''),
    tags: stringArraySchema,
    importance: z.coerce.number().catch(50),
  })
  .strip();

const aiPayloadSchema = z
  .object({
    title: z.string().catch(''),
    summary: z.string().catch(''),
    highlights: stringArraySchema,
    items: z.array(aiItemSchema).catch([]),
  })
  .strip();

interface NormalizeOptions {
  category: NewsCategoryProfile;
  candidates: Map<string, NewsBriefInputItem>;
  outputItemCount: number;
  contentMaxChars: number;
}

@Injectable()
export class NewsBriefAiClient {
  constructor(private readonly config: NewsBriefConfigService) {}

  async analyzeNewsBrief(input: {
    category: NewsCategoryProfile;
    briefDate: string;
    items: NewsBriefInputItem[];
    outputItemCount: number;
    searchEvidence?: NewsBriefSearchEvidence[];
    /** P0=300，P1 搜索增强后=600。 */
    contentMaxChars?: number;
  }): Promise<NewsBriefAnalysis> {
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
      timeout: this.config.aiTimeoutMs,
      maxRetries: this.config.aiMaxRetries,
    });

    const outputItemCount = this.resolveOutputItemCount(input.outputItemCount);
    const contentMaxChars = input.contentMaxChars ?? P0_CONTENT_MAX_CHARS;

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      // DeepSeek 默认开启思考模式，结构化 JSON 生成时关闭并留足输出空间。
      ...(isDeepseek
        ? { thinking: { type: 'disabled' as const }, max_tokens: 8192 }
        : {}),
      messages: [
        { role: 'system', content: this.getSystemPrompt() },
        {
          role: 'user',
          content: JSON.stringify(
            this.buildUserPayload({
              ...input,
              outputItemCount,
              contentMaxChars,
            }),
          ),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI returned empty content');
    }

    const candidates = new Map(input.items.map((item) => [item.ref, item]));
    return this.parseAnalysis(content, {
      category: input.category,
      candidates,
      outputItemCount,
      contentMaxChars,
    });
  }

  getModel(): string {
    return this.config.aiModel;
  }

  /**
   * 目标条数只在这里收敛：提示词里的 targetItemCount 与解析时保留的条数必须
   * 是同一个值，否则会出现「让模型写 3 条、只保留 2 条」这类白付费的情况。
   */
  private resolveOutputItemCount(requested: number): number {
    if (!Number.isFinite(requested)) return PROMPT_BUDGET.maxOutputItems;
    return Math.min(
      Math.max(1, Math.floor(requested)),
      PROMPT_BUDGET.maxOutputItems,
    );
  }

  private getSystemPrompt() {
    return [
      '你是一名严谨的中文新闻编辑，负责把当日热点榜单整理成「板块新闻简报」。',
      '你只使用给定的候选条目和检索证据中的信息；不得编造引语、数字、时间、机构表态或链接。',
      '信息不足时，在 content 中明确写「细节待核实」，不要用推测填充。',
      '同一事件合并为一条；按重要性从高到低排序。',
      '只输出合法 JSON，不要输出 Markdown 围栏、HTML 或解释性文字。',
    ].join('\n');
  }

  private buildUserPayload(input: {
    category: NewsCategoryProfile;
    briefDate: string;
    items: NewsBriefInputItem[];
    outputItemCount: number;
    searchEvidence?: NewsBriefSearchEvidence[];
    contentMaxChars?: number;
  }) {
    const targetItemCount = this.resolveOutputItemCount(input.outputItemCount);
    const minItemCount = Math.min(3, targetItemCount);
    const contentMaxChars = input.contentMaxChars ?? P0_CONTENT_MAX_CHARS;

    return {
      instruction: {
        outputLanguage: 'zh-CN',
        targetItemCount,
        contentTarget: `${contentMaxChars} 字以内（${contentMaxChars > P0_CONTENT_MAX_CHARS ? '开启搜索增强，可结合检索证据' : 'P0 无搜索增强，基于标题与摘要整理'}；信息不足时短写）`,
        requiredJsonShape: {
          title: 'string，简报标题',
          summary: 'string，100–200 字，整份简报摘要',
          highlights: ['string，3–5 条要点'],
          items: [
            {
              sourceRef: 'string，必须取自候选条目的 ref',
              title: 'string，新闻标题，≤80 字',
              summary: 'string，新闻简介，20–160 字',
              content: `string，新闻内容，${contentMaxChars} 字以内`,
              tags: ['string，≤5 个'],
              importance: 'number，0–100',
            },
          ],
        },
        rules: [
          `items 数量 ${minItemCount}–${targetItemCount} 条（超出的条目会被丢弃）`,
          'sourceRef 必须是候选条目的 ref，禁止编造',
          '标题不要原样复制候选标题',
          '不得输出候选之外的新闻',
          'content 信息不足时短写并注明「细节待核实」',
          '若提供了 searchEvidence，可用其补充背景，但不得编造证据之外的事实',
        ],
      },
      category: {
        code: input.category.code,
        name: input.category.name,
        description: input.category.description,
        focus: input.category.focus,
      },
      briefDate: input.briefDate,
      candidates: input.items
        .slice(0, PROMPT_BUDGET.maxCandidates)
        .map((item) => ({
          ref: item.ref,
          source: item.sourceName,
          title: this.truncate(item.title, PROMPT_BUDGET.maxTitleChars),
          desc: this.truncate(item.desc ?? '', PROMPT_BUDGET.maxDescChars),
          hot: item.hot ?? null,
          timestamp: item.timestamp ?? null,
        })),
      // 证据只给标题/摘要，不含真实 URL（URL 由服务端按 ref 回填）
      searchEvidence: (input.searchEvidence ?? [])
        .slice(0, PROMPT_BUDGET.maxSearchEvidence)
        .map((evidence) => ({
          ref: evidence.ref,
          query: this.truncate(
            evidence.query,
            PROMPT_BUDGET.maxEvidenceQueryChars,
          ),
          results: evidence.results
            .slice(0, PROMPT_BUDGET.maxEvidenceResults)
            .map((result) => ({
              title: this.truncate(result.title, PROMPT_BUDGET.maxTitleChars),
              content: this.truncate(
                result.content ?? '',
                PROMPT_BUDGET.maxEvidenceContentChars,
              ),
            })),
        })),
    };
  }

  /**
   * 解析 + 归一化 AI 返回。对测试可见（spec 直接调用）。
   */
  parseAnalysis(content: string, options: NormalizeOptions): NewsBriefAnalysis {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `AI returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const result = aiPayloadSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `AI returned invalid news brief structure: ${result.error.message}`,
      );
    }

    const payload = result.data as NewsBriefAiPayload;
    const items = this.normalizeItems(payload, options);
    if (items.length === 0) {
      throw new Error('AI returned no valid news items');
    }

    const highlights = payload.highlights
      .map((item) => this.truncate(item.trim(), SUMMARY_MAX_CHARS))
      .filter(Boolean)
      .slice(0, 5);

    const summary =
      this.truncate(payload.summary.trim(), 200) ||
      this.truncate(highlights.join('；'), 200);
    if (!summary) {
      throw new Error('AI returned a news brief without a summary');
    }

    const title =
      this.truncate(payload.title.trim(), SUMMARY_MAX_CHARS) ||
      `${options.category.name}每日简报`;

    return { title, summary, highlights, items };
  }

  private normalizeItems(
    payload: NewsBriefAiPayload,
    options: NormalizeOptions,
  ): NewsBriefItem[] {
    const seenRefs = new Set<string>();
    const seenTitles = new Set<string>();
    const items: Array<{ item: NewsBriefItem; order: number }> = [];

    payload.items.forEach((raw, index) => {
      const sourceRef = raw.sourceRef.trim();
      const candidate = options.candidates.get(sourceRef);
      // sourceRef 无法回填 -> 丢弃，避免模型编造来源/链接
      if (!candidate || seenRefs.has(sourceRef)) return;

      const title = this.truncate(raw.title.trim(), TITLE_MAX_CHARS);
      const content = this.truncate(
        raw.content.trim(),
        options.contentMaxChars,
      );
      const summary =
        this.truncate(raw.summary.trim(), SUMMARY_MAX_CHARS) ||
        this.truncate(this.firstSentence(content), SUMMARY_MAX_CHARS);
      if (!title || !content || !summary) return;

      const titleKey = this.canonicalTitle(title);
      if (titleKey && seenTitles.has(titleKey)) return;

      seenRefs.add(sourceRef);
      if (titleKey) seenTitles.add(titleKey);

      const tags = this.normalizeTags(raw.tags ?? []);
      const publishedAt = this.toIsoString(candidate.timestamp);

      items.push({
        order: index,
        item: {
          id: createHash('sha256')
            .update(`${options.category.code}|${sourceRef}`)
            .digest('hex')
            .slice(0, 12),
          title,
          summary,
          content,
          source: {
            code: candidate.source,
            name: candidate.sourceName,
            url: candidate.url,
          },
          ...(publishedAt ? { publishedAt } : {}),
          ...(tags.length > 0 ? { tags } : {}),
          importance: this.clampImportance(raw.importance ?? 50),
        },
      });
    });

    return items
      .sort(
        (a, b) =>
          (b.item.importance ?? 0) - (a.item.importance ?? 0) ||
          a.order - b.order,
      )
      .slice(0, options.outputItemCount)
      .map((entry) => entry.item);
  }

  private normalizeTags(tags: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const raw of tags) {
      const tag = this.truncate(raw.trim(), TAG_MAX_CHARS);
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      result.push(tag);
      if (result.length >= TAG_MAX_COUNT) break;
    }
    return result;
  }

  private clampImportance(value: number): number {
    if (!Number.isFinite(value)) return 50;
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  private canonicalTitle(title: string): string {
    return title.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  }

  private firstSentence(content: string): string {
    const match = content.match(/[^。！？!?]+[。！？!?]?/u);
    return match ? match[0] : '';
  }

  private toIsoString(timestamp?: number): string | undefined {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
      return undefined;
    }
    // 部分来源给的是秒级时间戳，统一归一化后再转 ISO。
    const millis = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  private truncate(value: string, limit: number): string {
    return value.length > limit ? value.slice(0, limit) : value;
  }
}
