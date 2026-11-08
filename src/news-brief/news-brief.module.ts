import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '../cache/cache.module';
import { DatabaseModule } from '../database/database.module';
import { DailyBriefModule } from '../daily-brief/daily-brief.module';
import { HotListsModule } from '../host-lists/hot-lists.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { NewsBriefAiClient } from './clients/news-brief-ai.client';
import { NewsBriefSearchService } from './clients/news-brief-search.service';
import { NewsBriefConfigService } from './news-brief.config';
import { NewsBriefController } from './news-brief.controller';
import { NewsBriefScheduler } from './news-brief.scheduler';
import { NewsBriefService } from './news-brief.service';

/**
 * 通用新闻简报模块：独立于 daily-brief 的接口命名空间、collection、
 * 调度器与配置前缀，不改变 /api/briefs 的任何行为。
 */
@Module({
  // ScheduleModule.forRoot() 已由 SchedulerModule 提供；这里只裸 import。
  imports: [
    ScheduleModule,
    CacheModule,
    DatabaseModule,
    HotListsModule,
    SchedulerModule,
    // P1 搜索增强复用 daily-brief 已实现的搜索 client（只增 exports，无行为改动）
    DailyBriefModule,
  ],
  controllers: [NewsBriefController],
  providers: [
    NewsBriefConfigService,
    NewsBriefService,
    NewsBriefScheduler,
    NewsBriefAiClient,
    NewsBriefSearchService,
  ],
  exports: [NewsBriefService],
})
export class NewsBriefModule {}
