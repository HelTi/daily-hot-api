import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { NewsBriefConfigService } from './news-brief.config';
import { NewsBriefService } from './news-brief.service';
import { NewsBriefScheduler } from './news-brief.scheduler';
import { GenerateNewsBriefDto } from './dto/generate-news-brief.dto';
import { NewsBriefDateParamDto } from './dto/news-brief-date-param.dto';
import { ListNewsBriefsQueryDto } from './dto/list-news-briefs-query.dto';

@Controller('api/news-briefs')
export class NewsBriefController {
  constructor(
    private readonly newsBriefService: NewsBriefService,
    private readonly newsBriefScheduler: NewsBriefScheduler,
    private readonly config: NewsBriefConfigService,
  ) {}

  /**
   * 手动生成：默认禁用。
   * 产品要求前端不允许触发生成接口，只有运维临时开启该开关后才能调用。
   */
  @Post('generate')
  generate(@Body() body: GenerateNewsBriefDto) {
    if (!this.config.manualGenerateEnabled) {
      throw new ForbiddenException(
        'Manual news brief generation is disabled. Set NEWS_BRIEF_MANUAL_GENERATE_ENABLED=true for ops use; frontend must not call this endpoint.',
      );
    }

    return this.newsBriefService.generate(body);
  }

  @Get('config')
  getConfig() {
    return {
      enabled: this.newsBriefScheduler.isEnabled(),
      ...this.newsBriefService.getConfig(),
    };
  }

  @Get('categories')
  getCategories() {
    return this.newsBriefService.getCategories();
  }

  @Get('digest')
  getDigest(
    @Query('categories') categories?: string | string[],
    @Query('date') date?: string,
    @Query('period') period?: string,
  ) {
    return this.newsBriefService.findDigest(categories, date, period);
  }

  @Get('scheduler/status')
  getSchedulerStatus() {
    return this.newsBriefScheduler.getStatus();
  }

  @Post('scheduler/start')
  startScheduler() {
    this.newsBriefScheduler.start();
    return { message: 'News brief scheduler started' };
  }

  @Post('scheduler/stop')
  stopScheduler() {
    this.newsBriefScheduler.stop();
    return { message: 'News brief scheduler stopped' };
  }

  @Post('scheduler/reconfigure')
  reconfigureScheduler() {
    this.newsBriefScheduler.reconfigure();
    return { message: 'News brief scheduler reconfigured' };
  }

  @Get('latest')
  findLatest(
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('includeDebug') includeDebug?: string,
  ) {
    return this.newsBriefService.findLatest(
      category,
      period,
      includeDebug === 'true',
    );
  }

  @Get()
  list(@Query() query: ListNewsBriefsQueryDto) {
    return this.newsBriefService.list(query);
  }

  @Delete('history')
  deleteHistory(
    @Query('olderThan') olderThan?: string,
    @Query('beforeDate') beforeDate?: string,
    @Query('category') category?: string,
  ) {
    return this.newsBriefService.deleteHistory({
      olderThan,
      beforeDate,
      category,
    });
  }

  @Delete(':date')
  deleteByDate(
    @Param() params: NewsBriefDateParamDto,
    @Query('category') category?: string,
    @Query('period') period?: string,
  ) {
    return this.newsBriefService.deleteByDate(params.date, category, period);
  }

  @Get(':date')
  findByDate(
    @Param() params: NewsBriefDateParamDto,
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('includeDebug') includeDebug?: string,
  ) {
    return this.newsBriefService.findByDate(
      params.date,
      category,
      period,
      includeDebug === 'true',
    );
  }
}
