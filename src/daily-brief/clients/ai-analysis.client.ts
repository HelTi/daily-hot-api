import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import {
  BriefAnalysis,
  BriefInputItem,
  BriefSearchEvidence,
} from '../interfaces/daily-brief.interface';

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

@Injectable()
export class AiAnalysisClient {
  constructor(private readonly configService: ConfigService) {}

  async analyzeDailyBrief(input: {
    briefDate: string;
    sources: string[];
    items: BriefInputItem[];
    searchEvidence: BriefSearchEvidence[];
  }): Promise<BriefAnalysis> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = this.getModel();
    const client = new OpenAI({
      apiKey,
      baseURL: this.configService.get<string>('OPENAI_API_BASE_URL'),
    });

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '你是一个面向中文投资者和产业研究人员的每日热点简报分析师。',
            '你的任务不是复述新闻，而是识别重要事件、拆解产业链、关联A股公司，并给出风险与跟踪信号。',
            '必须谨慎处理A股公司和股票代码：只有在输入材料或搜索证据支持时才给出，无法确认就标记为待验证。',
            '只输出合法JSON，不要输出Markdown围栏。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction: this.getJsonSchemaInstruction(),
            briefDate: input.briefDate,
            sources: input.sources,
            hotItems: input.items,
            searchEvidence: input.searchEvidence,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI returned empty content');
    }

    return this.parseAnalysis(content);
  }

  getModel(): string {
    return this.configService.get<string>('AI_MODEL', 'deepseek-v4-flash');
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
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `AI returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const result = briefAnalysisSchema.safeParse(parsedContent);
    if (!result.success) {
      throw new Error(
        `AI returned invalid brief analysis structure: ${result.error.message}`,
      );
    }

    return result.data as BriefAnalysis;
  }
}
