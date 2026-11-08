import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { HotListsService } from '../host-lists/hot-lists.service';
import { NewsBriefConfigService } from './news-brief.config';
import { NewsBriefService } from './news-brief.service';
import { NewsCategoryProfile } from './interfaces/news-brief.interface';
import { PROMPT_BUDGET } from './clients/news-brief-ai.client';

@Injectable()
export class NewsBriefScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsBriefScheduler.name);
  private readonly cronJobName = 'news-brief-generate';
  private isRunning = false;
  private enabled = false;

  constructor(
    private readonly config: NewsBriefConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly newsBriefService: NewsBriefService,
    private readonly hotListsService: HotListsService,
  ) {
    this.enabled = this.config.enabled;
  }

  onModuleInit() {
    // 必须在 onModuleInit 里校验：HotListsService 通过 DiscoveryService 在
    // 自己的 onModuleInit 才完成来源注册，构造函数阶段 getAllSources() 还是空。
    // 校验全部已注册板块（不只是启用的）：registry 是仓库内的静态代码，写错
    // 来源 code 必须立刻暴露，而不是等到有人改 NEWS_BRIEF_CATEGORIES 才炸。
    this.validateCategoryProfiles(this.config.knownCategories);
    this.setupCronJob();
  }

  onModuleDestroy() {
    this.stopCronJob();
  }

  /** 调度器是否启用的唯一事实来源。 */
  isEnabled() {
    return this.enabled;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.enabled,
      cronExpression: this.config.cronExpression,
      timezone: this.config.timezone,
      categories: this.config.categoryCodes,
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
    // 只重建当前进程的 Cron，不覆盖运行期 start/stop 状态。
    this.setupCronJob();
  }

  private setupCronJob() {
    try {
      this.stopCronJob();

      if (!this.enabled) {
        this.logger.log('News brief scheduler is disabled');
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
        `News brief cron job setup with expression: ${cronExpression}`,
      );
    } catch (error) {
      this.logger.error('Failed to setup news brief cron job:', error);
    }
  }

  private stopCronJob() {
    try {
      if (this.schedulerRegistry.doesExist('cron', this.cronJobName)) {
        this.schedulerRegistry.deleteCronJob(this.cronJobName);
        this.logger.log(`Stopped cron job: ${this.cronJobName}`);
      }
    } catch (error) {
      this.logger.error('Failed to stop news brief cron job:', error);
    }
  }

  private async handleCron() {
    if (!this.enabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.newsBriefService.generate();
      const succeeded = result.results.filter(
        (item) => item.status === 'success',
      ).length;
      const failed = result.results.filter(
        (item) => item.status === 'failed',
      ).length;
      this.logger.log(
        `News brief run for ${result.briefDate}/${result.period}: ${succeeded} succeeded, ${failed} failed`,
      );
    } catch (error) {
      this.logger.error('News brief generation failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private validateCategoryProfiles(profiles: NewsCategoryProfile[]) {
    const registeredSources = new Set(this.hotListsService.getAllSources());
    const missingSources: string[] = [];
    const oversized: string[] = [];

    for (const profile of profiles) {
      for (const source of profile.sources) {
        if (!registeredSources.has(source)) {
          missingSources.push(`${profile.code}:${source}`);
        }
      }
      if (profile.maxItems > PROMPT_BUDGET.maxOutputItems) {
        oversized.push(`${profile.code}:${profile.maxItems}`);
      }
    }

    if (missingSources.length > 0) {
      throw new Error(
        `Unknown hot list source(s) in news category registry: ${missingSources.join(
          ', ',
        )}`,
      );
    }
    if (oversized.length > 0) {
      throw new Error(
        `News category maxItems exceeds PROMPT_BUDGET.maxOutputItems (${PROMPT_BUDGET.maxOutputItems}): ${oversized.join(
          ', ',
        )}`,
      );
    }
  }
}
