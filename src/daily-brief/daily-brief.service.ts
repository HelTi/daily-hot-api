import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DailyBriefRepository } from '../database/repositories/daily-brief.repository';
import { HotItemRepository } from '../database/repositories/hot-item.repository';
import { HotListsService } from '../host-lists/hot-lists.service';
import { AiAnalysisClient } from './clients/ai-analysis.client';
import { TavilySearchClient } from './clients/tavily-search.client';
import {
  BriefInputItem,
  BriefSearchEvidence,
  GenerateBriefOptions,
} from './interfaces/daily-brief.interface';

@Injectable()
export class DailyBriefService {
  private readonly logger = new Logger(DailyBriefService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dailyBriefRepository: DailyBriefRepository,
    private readonly hotItemRepository: HotItemRepository,
    private readonly hotListsService: HotListsService,
    private readonly aiAnalysisClient: AiAnalysisClient,
    private readonly tavilySearchClient: TavilySearchClient,
  ) {}

  async generateBrief(options: GenerateBriefOptions = {}) {
    const period = options.period || 'daily';
    const briefDate = options.date || this.formatDate(new Date());
    const sources = this.resolveSources(options.sources);
    const lookbackHours = this.configService.get<number>(
      'BRIEF_LOOKBACK_HOURS',
      24,
    );
    const inputWindow = this.resolveInputWindow(briefDate, lookbackHours);

    if (!options.force) {
      const existing = await this.dailyBriefRepository.findByDate(
        briefDate,
        period,
      );
      if (existing?.status === 'success') {
        return existing;
      }
    }

    await this.dailyBriefRepository.upsertGenerating({
      briefDate,
      period,
      sources,
      inputWindow,
      model: this.aiAnalysisClient.getModel(),
    });

    try {
      const fetchedItems = await this.fetchLatestSourceItems(sources);
      const historyItems = await this.loadHistoryItems(
        sources,
        inputWindow.start.getTime(),
        inputWindow.end.getTime(),
      );
      const inputItems = this.mergeAndLimitItems([
        ...fetchedItems,
        ...historyItems,
      ]);

      if (inputItems.length === 0) {
        throw new Error('No hot items available for brief generation');
      }

      const searchEvidence = await this.buildSearchEvidence(inputItems);
      const analysis = await this.aiAnalysisClient.analyzeDailyBrief({
        briefDate,
        sources,
        items: inputItems,
        searchEvidence,
      });

      const brief = await this.dailyBriefRepository.markSuccess(
        briefDate,
        period,
        {
          analysis: analysis as unknown as Record<string, unknown>,
          markdown: analysis.markdown || this.buildFallbackMarkdown(analysis),
          rawInputItems: inputItems as unknown as Record<string, unknown>[],
          searchEvidence: searchEvidence as unknown as Record<
            string,
            unknown
          >[],
          model: this.aiAnalysisClient.getModel(),
          tavilyUsed: searchEvidence.some((item) => item.results.length > 0),
        },
      );

      return this.toPublicBrief(brief);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.dailyBriefRepository.markFailed(briefDate, period, message);
      throw error;
    }
  }

  findLatest(period?: string, includeDebug = false) {
    return this.dailyBriefRepository.findLatest(period, includeDebug);
  }

  findByDate(date: string, period = 'daily', includeDebug = false) {
    return this.dailyBriefRepository.findByDate(date, period, includeDebug);
  }

  list(options: {
    page?: number;
    limit?: number;
    status?: 'generating' | 'success' | 'failed';
    period?: string;
    includeDebug?: boolean;
  }) {
    return this.dailyBriefRepository.list(options);
  }

  async deleteByDate(date: string, period?: string) {
    this.validateBriefDate(date);
    const result = await this.dailyBriefRepository.deleteByDate(date, period);

    return {
      mode: 'date',
      briefDate: date,
      period: period || null,
      deletedCount: result.deletedCount || 0,
    };
  }

  async deleteHistory(options: {
    olderThan?: string;
    beforeDate?: string;
    period?: string;
  }) {
    if (options.olderThan && options.beforeDate) {
      throw new BadRequestException(
        'Use either olderThan or beforeDate, not both',
      );
    }

    const beforeDate = options.beforeDate
      ? this.validateBriefDate(options.beforeDate)
      : this.resolveOlderThanDate(options.olderThan);

    const result = await this.dailyBriefRepository.deleteBeforeDate(
      beforeDate,
      options.period,
    );

    return {
      mode: options.beforeDate ? 'beforeDate' : 'olderThan',
      olderThan: options.olderThan || null,
      beforeDate,
      period: options.period || null,
      deletedCount: result.deletedCount || 0,
    };
  }

  getConfig() {
    return {
      enabled: this.configService.get<boolean>('BRIEF_ENABLED', false),
      cronExpression: this.configService.get<string>(
        'BRIEF_CRON_EXPRESSION',
        '0 12 * * *',
      ),
      timezone: this.configService.get<string>(
        'BRIEF_TIMEZONE',
        'Asia/Shanghai',
      ),
      sources: this.resolveSources(),
      lookbackHours: this.configService.get<number>('BRIEF_LOOKBACK_HOURS', 24),
      topItemsPerSource: this.configService.get<number>(
        'BRIEF_TOP_ITEMS_PER_SOURCE',
        10,
      ),
      maxTopics: this.configService.get<number>('BRIEF_MAX_TOPICS', 12),
      model: this.aiAnalysisClient.getModel(),
      tavilyConfigured: Boolean(
        this.configService.get<string>('TAVILY_API_KEY'),
      ),
    };
  }

  private toPublicBrief<T extends Record<string, unknown> | null>(brief: T): T {
    if (!brief) {
      return brief;
    }

    const { rawInputItems, searchEvidence, ...publicBrief } = brief;
    void rawInputItems;
    void searchEvidence;

    return publicBrief as T;
  }

  private async fetchLatestSourceItems(
    sources: string[],
  ): Promise<BriefInputItem[]> {
    const topItemsPerSource = this.configService.get<number>(
      'BRIEF_TOP_ITEMS_PER_SOURCE',
      10,
    );
    const results: BriefInputItem[] = [];

    for (const source of sources) {
      try {
        const hotList = await this.hotListsService.getHotList(source, {}, true);
        if (!hotList.data.length) {
          continue;
        }

        await this.hotItemRepository.saveHotItems(hotList.data, source);

        results.push(
          ...hotList.data.slice(0, topItemsPerSource).map((item) => ({
            source,
            title: item.title,
            desc: item.desc,
            hot: item.hot,
            url: item.url,
            mobileUrl: item.mobileUrl,
            timestamp: item.timestamp,
          })),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to refresh source ${source}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return results;
  }

  private async loadHistoryItems(
    sources: string[],
    startTime: number,
    endTime: number,
  ): Promise<BriefInputItem[]> {
    const topItemsPerSource = this.configService.get<number>(
      'BRIEF_TOP_ITEMS_PER_SOURCE',
      10,
    );
    const results = await Promise.all(
      sources.map(async (source) => {
        const items = await this.hotItemRepository.getDataByTimeRange(
          source,
          startTime,
          endTime,
        );
        return items.slice(0, topItemsPerSource).map((item) => ({
          source,
          title: item.title,
          desc: item.desc,
          hot: item.hot,
          url: item.url,
          mobileUrl: item.mobileUrl,
          timestamp: item.timestamp,
        }));
      }),
    );

    return results.flat();
  }

  private mergeAndLimitItems(items: BriefInputItem[]) {
    const maxItems =
      this.resolveSources().length *
      this.configService.get<number>('BRIEF_TOP_ITEMS_PER_SOURCE', 10);
    const seen = new Set<string>();
    const merged: BriefInputItem[] = [];

    for (const item of items) {
      if (!item.title || !item.url) {
        continue;
      }
      const key = `${item.source}:${item.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }

    return merged
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, maxItems);
  }

  private async buildSearchEvidence(
    items: BriefInputItem[],
  ): Promise<BriefSearchEvidence[]> {
    const maxTopics = this.configService.get<number>('BRIEF_MAX_TOPICS', 12);
    const candidates = items.slice(0, maxTopics);

    return Promise.all(
      candidates.map(async (item) => {
        const query = `${item.title} ${item.desc || ''} 产业链 A股 影响`;
        const results = await this.tavilySearchClient.search(query);
        return {
          topicTitle: item.title,
          query,
          results,
        };
      }),
    );
  }

  private resolveSources(sources?: string[]) {
    const configuredSources =
      sources && sources.length > 0
        ? sources
        : this.parseCsv(
            this.configService.get<string>(
              'BRIEF_SOURCES',
              'cls,eastmoney,gelonghui',
            ),
          );

    return configuredSources.filter(Boolean);
  }

  private parseCsv(value: string) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private resolveInputWindow(briefDate: string, lookbackHours: number) {
    const now = new Date();
    const today = this.formatDate(now);
    const end =
      briefDate === today
        ? now
        : this.createDateInTimezone(briefDate, 23, 59, 59);
    const start = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);

    return {
      start,
      end,
      lookbackHours,
    };
  }

  private formatDate(date: Date) {
    const timezone = this.configService.get<string>(
      'BRIEF_TIMEZONE',
      'Asia/Shanghai',
    );
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private validateBriefDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Date must be in YYYY-MM-DD format');
    }

    return date;
  }

  private resolveOlderThanDate(olderThan?: string) {
    if (!olderThan) {
      throw new BadRequestException('olderThan or beforeDate is required');
    }

    const normalized = olderThan.trim().toLowerCase();
    const aliases: Record<string, string> = {
      month: '1m',
      'one-month': '1m',
      year: '1y',
      'one-year': '1y',
    };
    const value = aliases[normalized] || normalized;
    const match = value.match(
      /^(\d+)(d|day|days|m|month|months|y|year|years)$/,
    );

    if (!match) {
      throw new BadRequestException(
        'olderThan must use a value like 30d, 1m, or 1y',
      );
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const cutoff = new Date();

    if (unit.startsWith('d')) {
      cutoff.setDate(cutoff.getDate() - amount);
    } else if (unit.startsWith('m')) {
      cutoff.setMonth(cutoff.getMonth() - amount);
    } else {
      cutoff.setFullYear(cutoff.getFullYear() - amount);
    }

    return this.formatDate(cutoff);
  }

  private createDateInTimezone(
    date: string,
    hour: number,
    minute: number,
    second: number,
  ) {
    const timezone = this.configService.get<string>(
      'BRIEF_TIMEZONE',
      'Asia/Shanghai',
    );
    const [year, month, day] = date.split('-').map(Number);
    const utcGuess = new Date(
      Date.UTC(year, month - 1, day, hour, minute, second),
    );
    const offset = this.getTimezoneOffset(utcGuess, timezone);

    return new Date(utcGuess.getTime() - offset);
  }

  private getTimezoneOffset(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );

    return (
      Date.UTC(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second,
      ) - date.getTime()
    );
  }

  private buildFallbackMarkdown(analysis: { summary: string }) {
    return `# 每日简报\n\n${analysis.summary || ''}`;
  }
}
