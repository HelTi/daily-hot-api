import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { DailyBriefService } from './daily-brief.service';
import { DailyBriefScheduler } from './daily-brief.scheduler';
import { GenerateBriefDto } from './dto/generate-brief.dto';
import { StockRankingQueryDto } from './dto/stock-ranking-query.dto';

@Controller('api/briefs')
export class DailyBriefController {
  constructor(
    private readonly dailyBriefService: DailyBriefService,
    private readonly dailyBriefScheduler: DailyBriefScheduler,
  ) {}

  @Post('generate')
  generate(@Body() body: GenerateBriefDto) {
    return this.dailyBriefService.generateBrief(body);
  }

  @Get('config')
  getConfig() {
    return this.dailyBriefService.getConfig();
  }

  @Get('scheduler/status')
  getSchedulerStatus() {
    return this.dailyBriefScheduler.getStatus();
  }

  @Post('scheduler/start')
  startScheduler() {
    this.dailyBriefScheduler.start();
    return { message: 'Daily brief scheduler started' };
  }

  @Post('scheduler/stop')
  stopScheduler() {
    this.dailyBriefScheduler.stop();
    return { message: 'Daily brief scheduler stopped' };
  }

  @Post('scheduler/reconfigure')
  reconfigureScheduler() {
    this.dailyBriefScheduler.reconfigure();
    return { message: 'Daily brief scheduler reconfigured' };
  }

  @Get('latest')
  findLatest(
    @Query('period') period?: string,
    @Query('includeDebug') includeDebug?: string,
  ) {
    return this.dailyBriefService.findLatest(
      period,
      this.parseBoolean(includeDebug),
    );
  }

  @Get()
  list(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('status') status?: 'generating' | 'success' | 'failed',
    @Query('period') period?: string,
    @Query('includeDebug') includeDebug?: string,
  ) {
    return this.dailyBriefService.list({
      page,
      limit,
      status,
      period,
      includeDebug: this.parseBoolean(includeDebug),
    });
  }

  @Get('statistics/stocks')
  getStockRanking(@Query() query: StockRankingQueryDto) {
    return this.dailyBriefService.getStockRanking(query);
  }

  @Delete('history')
  deleteHistory(
    @Query('olderThan') olderThan?: string,
    @Query('beforeDate') beforeDate?: string,
    @Query('period') period?: string,
  ) {
    return this.dailyBriefService.deleteHistory({
      olderThan,
      beforeDate,
      period,
    });
  }

  @Get(':date')
  findByDate(
    @Param('date') date: string,
    @Query('period') period?: string,
    @Query('includeDebug') includeDebug?: string,
  ) {
    return this.dailyBriefService.findByDate(
      date,
      period,
      this.parseBoolean(includeDebug),
    );
  }

  @Delete(':date')
  deleteByDate(@Param('date') date: string, @Query('period') period?: string) {
    return this.dailyBriefService.deleteByDate(date, period);
  }

  private parseBoolean(value?: string) {
    return value === 'true';
  }
}
