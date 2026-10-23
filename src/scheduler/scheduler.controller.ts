import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  HttpCode,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SourceConfigRepository } from '../database/repositories/source-config.repository';
import { UpdateSourceConfigDto } from './dto/update-source-config.dto';
import { TriggerFetchDto } from './dto/trigger-fetch.dto';

@Controller('api/scheduler')
export class SchedulerController {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly sourceConfigRepository: SourceConfigRepository,
  ) {}

  // 获取定时任务状态
  @Get('status')
  getStatus() {
    return this.schedulerService.getStatus();
  }

  // 获取忽略的数据源列表
  @Get('ignored-sources')
  getIgnoredSources() {
    const status = this.schedulerService.getStatus();
    return {
      ignoredSources: status.ignoreSources,
      message: 'These sources will be skipped during data fetching',
    };
  }

  // 启动定时任务
  @Post('start')
  start() {
    this.schedulerService.start();
    return { message: 'Scheduler started' };
  }

  // 停止定时任务
  @Post('stop')
  stop() {
    this.schedulerService.stop();
    return { message: 'Scheduler stopped' };
  }

  // 手动触发数据抓取
  @Post('trigger')
  @HttpCode(202)
  async triggerFetch(@Body() body: TriggerFetchDto) {
    return this.schedulerService.triggerFetch(body?.source);
  }

  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.schedulerService.getRun(runId);
  }

  // 更新数据源配置
  @Put('config/:source')
  async updateConfig(
    @Param('source') source: string,
    @Body() config: UpdateSourceConfigDto,
  ) {
    if (config.enabled !== undefined) {
      await this.sourceConfigRepository.setEnabled(source, config.enabled);
    }
    if (config.interval !== undefined) {
      await this.sourceConfigRepository.updateInterval(source, config.interval);
    }
    return { message: 'Config updated' };
  }

  // 获取所有数据源配置
  @Get('configs')
  async getConfigs() {
    return this.sourceConfigRepository.findAll();
  }

  // 重新配置定时任务
  @Post('reconfigure')
  reconfigure() {
    this.schedulerService.reconfigureCron();
    return { message: 'Scheduler reconfigured' };
  }
}
