import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DailyBriefService } from './daily-brief.service';
import { DailyBriefConfigService } from './daily-brief.config';

@Injectable()
export class DailyBriefScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyBriefScheduler.name);
  private readonly cronJobName = 'daily-brief-generate';
  private isRunning = false;
  private enabled = false;

  constructor(
    private readonly config: DailyBriefConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly dailyBriefService: DailyBriefService,
  ) {
    this.enabled = this.config.enabled;
  }

  onModuleInit() {
    this.setupCronJob();
  }

  onModuleDestroy() {
    this.stopCronJob();
  }

  /**
   * 调度器是否启用的唯一事实来源。
   * `start()` / `stop()` 只改内存状态，直接读 `BRIEF_ENABLED` 会与真实状态不一致。
   */
  isEnabled() {
    return this.enabled;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.enabled,
      cronExpression: this.config.cronExpression,
      timezone: this.config.timezone,
      cronJobExists: this.schedulerRegistry.doesExist('cron', this.cronJobName),
    };
  }

  start() {
    this.enabled = true;
    this.setupCronJob();
  }

  stop() {
    this.enabled = false;
    this.stopCronJob();
  }

  reconfigure() {
    // 重新读取配置，使其与 cron 表达式、时区一样跟随配置变化
    this.enabled = this.config.enabled;
    this.setupCronJob();
  }

  private setupCronJob() {
    try {
      this.stopCronJob();

      if (!this.enabled) {
        this.logger.log('Daily brief scheduler is disabled');
        return;
      }

      const cronExpression = this.config.cronExpression;
      const timezone = this.config.timezone;
      const job = new CronJob(
        cronExpression,
        () => {
          void this.handleCron();
        },
        null,
        false,
        timezone,
      );

      this.schedulerRegistry.addCronJob(this.cronJobName, job);
      job.start();
      this.logger.log(
        `Daily brief cron job setup with expression: ${cronExpression}`,
      );
    } catch (error) {
      this.logger.error('Failed to setup daily brief cron job:', error);
    }
  }

  private stopCronJob() {
    try {
      if (this.schedulerRegistry.doesExist('cron', this.cronJobName)) {
        this.schedulerRegistry.deleteCronJob(this.cronJobName);
        this.logger.log(`Stopped cron job: ${this.cronJobName}`);
      }
    } catch (error) {
      this.logger.error('Failed to stop daily brief cron job:', error);
    }
  }

  private async handleCron() {
    if (!this.enabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      await this.dailyBriefService.generateBrief({ force: true });
    } catch (error) {
      this.logger.error('Daily brief generation failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
}
