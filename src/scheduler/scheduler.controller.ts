import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SourceConfigRepository } from '../database/repositories/source-config.repository';

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
  async triggerFetch(@Body() body: { source?: string }) {
    await this.schedulerService.triggerFetch(body.source);
    return { message: 'Data fetch triggered' };
  }

  // 更新数据源配置
  @Put('config/:source')
  async updateConfig(
    @Param('source') source: string,
    @Body() config: { enabled?: boolean; interval?: number },
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
