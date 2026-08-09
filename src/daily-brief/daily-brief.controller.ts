import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DailyBriefService } from './daily-brief.service';
import { DailyBriefScheduler } from './daily-brief.scheduler';
import { GenerateBriefDto } from './dto/generate-brief.dto';
import { StockRankingQueryDto } from './dto/stock-ranking-query.dto';
import { ListBriefsQueryDto } from './dto/list-briefs-query.dto';
import { BriefDateParamDto } from './dto/brief-date-param.dto';

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
    return {
      enabled: this.dailyBriefScheduler.isEnabled(),
      ...this.dailyBriefService.getConfig(),
    };
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
  list(@Query() query: ListBriefsQueryDto) {
    return this.dailyBriefService.list(query);
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
    @Param() params: BriefDateParamDto,
    @Query('period') period?: string,
    @Query('includeDebug') includeDebug?: string,
  ) {
    return this.dailyBriefService.findByDate(
      params.date,
      period,
      this.parseBoolean(includeDebug),
    );
  }

  @Delete(':date')
  deleteByDate(
    @Param() params: BriefDateParamDto,
    @Query('period') period?: string,
  ) {
    return this.dailyBriefService.deleteByDate(params.date, period);
  }

  private parseBoolean(value?: string) {
    return value === 'true';
  }
}
