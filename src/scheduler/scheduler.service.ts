import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HotListsService } from '../host-lists/hot-lists.service';
import { SourceConfigRepository } from '../database/repositories/source-config.repository';
import { FetchHotDataTask } from './tasks/fetch-hot-data.task';
import { CronJob } from 'cron';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private isRunning = false;
  private schedulerEnabled = false;
  private readonly cronJobName = 'hot-data-fetch';

  private readonly ignoreSources: string[] = [];

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly hotListsService: HotListsService,
    private readonly sourceConfigRepository: SourceConfigRepository,
    private readonly fetchHotDataTask: FetchHotDataTask,
  ) {
    this.loadIgnoreSources();
    this.loadSchedulerConfig();
  }

  async onModuleInit() {
    await this.initializeSourceConfigs();
    this.setupDynamicCronJob();
  }

  onModuleDestroy() {
    this.stopDynamicCronJob();
  }

  // 加载忽略的数据源配置
  private loadIgnoreSources() {
    const ignoreSaveConfig = this.configService.get<string>(
      'IGNORE_SAVE_SOURCES',
    );
    if (ignoreSaveConfig) {
      this.ignoreSources.push(
        ...ignoreSaveConfig.split(',').map((s) => s.trim()),
      );
      this.logger.log(
        `Ignoring sources for saving: ${this.ignoreSources.join(', ')}`,
      );
    }
  }

  // 加载定时任务配置
  private loadSchedulerConfig() {
    const autoStart = this.configService.get<boolean>(
      'SCHEDULER_AUTO_START',
      true,
    );
    this.schedulerEnabled = autoStart;
    this.logger.log(
      `Scheduler auto-start: ${autoStart ? 'enabled' : 'disabled'}`,
    );
  }

  // 设置动态定时任务
  private setupDynamicCronJob() {
    try {
      // 先停止现有的定时任务
      this.stopDynamicCronJob();

      // 从配置中获取 cron 表达式
      const cronExpression = this.configService.get<string>(
        'SCHEDULER_CRON_EXPRESSION',
        '0 */12 * * *',
      );
      this.logger.log(`cronExpression: ${cronExpression}`);

      if (this.schedulerEnabled) {
        // 创建新的 CronJob
        const job = new CronJob(cronExpression, () => {
          void this.handleCron();
        });

        // 添加到 SchedulerRegistry
        this.schedulerRegistry.addCronJob(this.cronJobName, job);
        job.start();

        this.logger.log(
          `Dynamic cron job setup with expression: ${cronExpression}`,
        );
      } else {
        this.logger.log('Scheduler is disabled, not starting cron job');
      }
    } catch (error) {
      this.logger.error('Failed to setup dynamic cron job:', error);
    }
  }

  // 停止动态定时任务
  private stopDynamicCronJob() {
    try {
      if (this.schedulerRegistry.doesExist('cron', this.cronJobName)) {
        this.schedulerRegistry.deleteCronJob(this.cronJobName);
        this.logger.log(`Stopped cron job: ${this.cronJobName}`);
      }
    } catch (error) {
      this.logger.error('Failed to stop cron job:', error);
    }
  }

  // 检查数据源是否应该被忽略
  private shouldIgnoreSource(source: string): boolean {
    return this.ignoreSources.includes(source);
  }

  // 初始化数据源配置
  private async initializeSourceConfigs() {
    try {
      const sources = this.hotListsService.getAllSources();
      await this.sourceConfigRepository.initializeConfigs(sources);
      this.logger.log(`Initialized ${sources.length} source configurations`);
    } catch (error) {
      this.logger.error('Failed to initialize source configs:', error);
    }
  }

  // 主定时任务处理函数
  async handleCron() {
    // 检查定时任务是否启用
    this.logger.log('handleCron');
    if (!this.schedulerEnabled) {
      return;
    }

    if (this.isRunning) {
      this.logger.debug('Previous task still running, skipping...');
      return;
    }

    this.isRunning = true;
    try {
      await this.processScheduledTasks();
    } catch (error) {
      this.logger.error('Error in scheduled task:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // 处理定时任务
  private async processScheduledTasks() {
    const enabledConfigs = await this.sourceConfigRepository.findEnabled();

    for (const config of enabledConfigs) {
      // 检查是否应该忽略该数据源
      if (this.shouldIgnoreSource(config.source)) {
        this.logger.debug(`Skipping ignored source: ${config.source}`);
        continue;
      }

      this.logger.log(`Scheduling fetch for source: ${config.source}`);
      // 异步执行，不等待完成
      this.fetchHotDataTask.execute(config.source).catch((error) => {
        this.logger.error(`Failed to fetch data for ${config.source}:`, error);
      });
    }
  }

  // 手动触发数据抓取
  async triggerFetch(source?: string): Promise<void> {
    if (source) {
      if (this.shouldIgnoreSource(source)) {
        this.logger.warn(`Cannot trigger fetch for ignored source: ${source}`);
        return;
      }
      await this.fetchHotDataTask.execute(source);
    } else {
      const enabledConfigs = await this.sourceConfigRepository.findEnabled();
      for (const config of enabledConfigs) {
        if (this.shouldIgnoreSource(config.source)) {
          this.logger.debug(`Skipping ignored source: ${config.source}`);
          continue;
        }
        await this.fetchHotDataTask.execute(config.source);
      }
    }
  }

  // 获取任务状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedulerEnabled: this.schedulerEnabled,
      cronJobs: this.schedulerRegistry.getCronJobs().size,
      ignoreSources: this.ignoreSources,
      cronExpression: this.configService.get<string>(
        'SCHEDULER_CRON_EXPRESSION',
      ),
      cronJobExists: this.schedulerRegistry.doesExist('cron', this.cronJobName),
    };
  }

  // 启动定时任务
  start() {
    this.schedulerEnabled = true;
    this.setupDynamicCronJob();
    this.logger.log('Scheduler enabled');
  }

  // 停止定时任务
  stop() {
    this.schedulerEnabled = false;
    this.stopDynamicCronJob();
    this.logger.log('Scheduler disabled');
  }

  // 重新配置定时任务
  reconfigureCron() {
    this.setupDynamicCronJob();
    this.logger.log('Cron job reconfigured');
  }
}
