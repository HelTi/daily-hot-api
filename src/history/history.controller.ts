import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { HistoryService } from './history.service';
import { SearchHistoryDto } from './dto/search-history.dto';
import {
  HistoryResponseDto,
  StatsResponseDto,
} from './dto/history-response.dto';

@Controller('api/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  // 搜索历史数据
  @Get('search')
  async searchHistory(
    @Query() searchDto: SearchHistoryDto,
  ): Promise<HistoryResponseDto> {
    return this.historyService.searchHistory(searchDto);
  }

  // 获取所有数据源列表
  @Get('sources')
  async getSources(): Promise<string[]> {
    return this.historyService.getSources();
  }

  // 获取数据统计
  @Get('stats')
  async getStats(): Promise<StatsResponseDto> {
    return this.historyService.getStats();
  }

  // 获取数据源配置
  @Get('configs')
  async getSourceConfigs() {
    return this.historyService.getSourceConfigs();
  }

  // 获取最新数据
  @Get('latest')
  async getLatestData(
    @Query('source') source?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.historyService.getLatestData(source, limit);
  }

  // 根据时间范围获取数据
  @Get('range/:source/:startTime/:endTime')
  async getDataByTimeRange(
    @Param('source') source: string,
    @Param('startTime', ParseIntPipe) startTime: number,
    @Param('endTime', ParseIntPipe) endTime: number,
  ) {
    return this.historyService.getDataByTimeRange(source, startTime, endTime);
  }
}
