import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../database/database.module';
import { HotListsModule } from '../host-lists/hot-lists.module';
import { AiAnalysisClient } from './clients/ai-analysis.client';
import { TavilySearchClient } from './clients/tavily-search.client';
import { DailyBriefController } from './daily-brief.controller';
import { DailyBriefScheduler } from './daily-brief.scheduler';
import { DailyBriefService } from './daily-brief.service';

@Module({
  imports: [ScheduleModule, DatabaseModule, HotListsModule],
  controllers: [DailyBriefController],
  providers: [
    DailyBriefService,
    DailyBriefScheduler,
    AiAnalysisClient,
    TavilySearchClient,
  ],
  exports: [DailyBriefService],
})
export class DailyBriefModule {}
