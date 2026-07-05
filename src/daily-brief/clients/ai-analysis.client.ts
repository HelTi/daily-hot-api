import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  BriefAnalysis,
  BriefInputItem,
  BriefSearchEvidence,
} from '../interfaces/daily-brief.interface';

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

    return this.normalizeAnalysis(
      JSON.parse(content) as Partial<BriefAnalysis>,
    );
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

  private normalizeAnalysis(analysis: Partial<BriefAnalysis>): BriefAnalysis {
    return {
      summary: analysis.summary || '',
      highlights: Array.isArray(analysis.highlights) ? analysis.highlights : [],
      topics: Array.isArray(analysis.topics) ? analysis.topics : [],
      risks: Array.isArray(analysis.risks) ? analysis.risks : [],
      followUpSignals: Array.isArray(analysis.followUpSignals)
        ? analysis.followUpSignals
        : [],
      markdown: analysis.markdown || '',
    };
  }
}
