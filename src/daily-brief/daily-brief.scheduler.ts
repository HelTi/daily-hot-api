import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DailyBriefService } from './daily-brief.service';

@Injectable()
export class DailyBriefScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyBriefScheduler.name);
  private readonly cronJobName = 'daily-brief-generate';
  private isRunning = false;
  private enabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly dailyBriefService: DailyBriefService,
  ) {
    this.enabled = this.configService.get<boolean>('BRIEF_ENABLED', false);
  }

  onModuleInit() {
    this.setupCronJob();
  }

  onModuleDestroy() {
    this.stopCronJob();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.enabled,
      cronExpression: this.configService.get<string>(
        'BRIEF_CRON_EXPRESSION',
        '0 12 * * *',
      ),
      timezone: this.configService.get<string>(
        'BRIEF_TIMEZONE',
        'Asia/Shanghai',
      ),
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
    this.setupCronJob();
  }

  private setupCronJob() {
    try {
      this.stopCronJob();

      if (!this.enabled) {
        this.logger.log('Daily brief scheduler is disabled');
        return;
      }

      const cronExpression = this.configService.get<string>(
        'BRIEF_CRON_EXPRESSION',
        '0 12 * * *',
      );
      const timezone = this.configService.get<string>(
        'BRIEF_TIMEZONE',
        'Asia/Shanghai',
      );
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
