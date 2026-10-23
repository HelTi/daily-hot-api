import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { HotListsService } from '../host-lists/hot-lists.service';
import { SourceConfigRepository } from '../database/repositories/source-config.repository';
import { FetchHotDataTask, FetchResult } from './tasks/fetch-hot-data.task';
import { CronJob } from 'cron';
import { randomUUID } from 'crypto';

type FetchRun = {
  runId: string;
  status: 'running' | 'completed' | 'failed';
  sourceCount: number;
  startedAt: string;
  completedAt?: string;
  results?: Array<Omit<FetchResult, 'items'>>;
  error?: string;
};

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private isRunning = false;
  private schedulerEnabled = false;
  private readonly cronJobName = 'hot-data-fetch';

  private readonly ignoreSources: string[] = [];
  private readonly runs = new Map<string, FetchRun>();

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
    // 启动时 MongoDB 不可用可能导致初次配置初始化失败；每次调度重试一次。
    await this.initializeSourceConfigs();
    const enabledConfigs = await this.sourceConfigRepository.findEnabled();
    const now = Date.now();
    const sources = enabledConfigs
      .filter((config) => {
        if (this.shouldIgnoreSource(config.source)) return false;
        const interval =
          Number.isFinite(config.interval) && config.interval > 0
            ? config.interval
            : 30;
        return (
          !config.lastFetchAt ||
          config.lastFetchAt.getTime() + interval * 60_000 <= now
        );
      })
      .map((config) => config.source);
    await this.fetchHotDataTask.executeBatch(sources);
  }

  // 手动触发数据抓取
  async triggerFetch(source?: string): Promise<FetchRun> {
    let sources: string[];
    if (source) {
      if (this.shouldIgnoreSource(source)) {
        throw new BadRequestException(`Source '${source}' is ignored`);
      }
      if (!this.hotListsService.getAllSources().includes(source)) {
        throw new NotFoundException(`Source '${source}' not found`);
      }
      sources = [source];
    } else {
      await this.initializeSourceConfigs();
      const enabledConfigs = await this.sourceConfigRepository.findEnabled();
      sources = enabledConfigs
        .map((config) => config.source)
        .filter((name) => !this.shouldIgnoreSource(name));
    }

    this.pruneRuns(true);
    const run: FetchRun = {
      runId: randomUUID(),
      status: 'running',
      sourceCount: sources.length,
      startedAt: new Date().toISOString(),
    };
    this.runs.set(run.runId, run);
    void this.fetchHotDataTask.executeBatch(sources).then(
      (results) => {
        run.status = 'completed';
        run.completedAt = new Date().toISOString();
        run.results = results.map(({ items, ...summary }) => {
          void items;
          return {
            ...summary,
            error: summary.success ? undefined : 'Source refresh failed',
          };
        });
      },
      () => {
        run.status = 'failed';
        run.completedAt = new Date().toISOString();
        run.error = 'Batch fetch failed';
      },
    );
    return run;
  }

  getRun(runId: string): FetchRun {
    this.pruneRuns();
    const run = this.runs.get(runId);
    if (!run) throw new NotFoundException(`Fetch run '${runId}' not found`);
    return run;
  }

  private pruneRuns(ensureCapacity = false): void {
    const cutoff = Date.now() - 60 * 60_000;
    for (const [id, run] of this.runs) {
      if (run.status !== 'running' && Date.parse(run.startedAt) < cutoff) {
        this.runs.delete(id);
      }
    }
    while (ensureCapacity && this.runs.size >= 100) {
      const oldest = [...this.runs].find(
        ([, run]) => run.status !== 'running',
      )?.[0];
      if (!oldest) {
        throw new ServiceUnavailableException('Too many active fetch runs');
      }
      this.runs.delete(oldest);
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
