import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { HotListsService } from './hot-lists.service';
import { ConfigService } from '@nestjs/config';
import { HotListQueryDto } from './dto/hot-list.dto';
import { Response } from 'express';
import { RssService } from '../rss/rss.service';

@Controller('hot-lists')
export class HotListsController {
  constructor(
    private readonly hotListsService: HotListsService,
    private readonly configService: ConfigService,
    private readonly rssService: RssService,
  ) {}

  @Get('all')
  getAllSources() {
    const sources = this.hotListsService.getAllSources();
    return {
      code: 200,
      count: sources.length,
      routes: sources.map((source) => ({
        name: source,
        path: `/${source}`,
      })),
    };
  }

  @Get(':source')
  async getHotList(
    @Param('source') source: string,
    @Query() query: HotListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { noCache = false, limit, rss, ...otherParams } = query;
    // 获取热榜数据
    const listData = await this.hotListsService.getHotList(
      source,
      {
        limit: parseInt(limit),
        rss,
        ...otherParams, // 动态传递所有其他参数
      },
      noCache,
    );

    // 限制条目
    if (limit && listData?.data?.length > parseInt(limit)) {
      listData.total = parseInt(limit);
      listData.data = listData.data.slice(0, parseInt(limit));
    }

    // RSS 输出
    const rssEnabled = rss || this.configService.get('RSS_MODE');
    if (rssEnabled) {
      const rssContent = this.rssService.generateRss(listData);
      res.header('Content-Type', 'application/xml; charset=utf-8');
      return rssContent;
    }

    return { code: 200, ...listData };
  }
}
