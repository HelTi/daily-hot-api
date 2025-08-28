import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { FetchHotDataTask } from './tasks/fetch-hot-data.task';
import { DatabaseModule } from '../database/database.module';
import { HotListsModule } from '../host-lists/hot-lists.module';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, HotListsModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, FetchHotDataTask],
  exports: [SchedulerService],
})
export class SchedulerModule {}
