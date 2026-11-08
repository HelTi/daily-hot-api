import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '../cache/cache.module';
import { DatabaseModule } from '../database/database.module';
import { HotListsModule } from '../host-lists/hot-lists.module';
import { AiAnalysisClient } from './clients/ai-analysis.client';
import { TavilySearchClient } from './clients/tavily-search.client';
import { DeepseekSearchClient } from './clients/deepseek-search.client';
import { BriefSearchService } from './clients/brief-search.service';
import { DailyBriefController } from './daily-brief.controller';
import { DailyBriefScheduler } from './daily-brief.scheduler';
import { DailyBriefService } from './daily-brief.service';
import { DailyBriefConfigService } from './daily-brief.config';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [
    ScheduleModule,
    CacheModule,
    DatabaseModule,
    HotListsModule,
    SchedulerModule,
  ],
  controllers: [DailyBriefController],
  providers: [
    DailyBriefConfigService,
    DailyBriefService,
    DailyBriefScheduler,
    AiAnalysisClient,
    TavilySearchClient,
    DeepseekSearchClient,
    BriefSearchService,
  ],
  // TavilySearchClient / DeepseekSearchClient 供通用新闻简报（P1 搜索增强）
  // 复用；只增加 export，不改变任何现有行为。
  exports: [DailyBriefService, TavilySearchClient, DeepseekSearchClient],
})
export class DailyBriefModule {}
