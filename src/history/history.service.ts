import { Injectable } from '@nestjs/common';
import {
  HotItemRepository,
  SearchHistoryOptions,
} from '../database/repositories/hot-item.repository';
import { SourceConfigRepository } from '../database/repositories/source-config.repository';
import { SearchHistoryDto } from './dto/search-history.dto';
import {
  HistoryResponseDto,
  StatsResponseDto,
} from './dto/history-response.dto';

@Injectable()
export class HistoryService {
  constructor(
    private readonly hotItemRepository: HotItemRepository,
    private readonly sourceConfigRepository: SourceConfigRepository,
  ) {}

  // 搜索历史数据
  async searchHistory(
    searchDto: SearchHistoryDto,
  ): Promise<HistoryResponseDto> {
    const options: SearchHistoryOptions = {
      source: searchDto.source,
      keyword: searchDto.keyword,
      page: searchDto.page,
      limit: searchDto.limit,
      sortBy: searchDto.sortBy,
      sortOrder: searchDto.sortOrder,
    };

    // 处理日期范围
    if (searchDto.startDate) {
      options.startDate = new Date(searchDto.startDate);
    }
    if (searchDto.endDate) {
      options.endDate = new Date(searchDto.endDate);
    }

    return this.hotItemRepository.searchHistory(options);
  }

  // 获取所有数据源列表
  async getSources(): Promise<string[]> {
    return this.hotItemRepository.getSources();
  }

  // 获取数据统计
  async getStats(): Promise<StatsResponseDto> {
    return this.hotItemRepository.getStats();
  }

  // 获取数据源配置
  async getSourceConfigs() {
    return this.sourceConfigRepository.findAll();
  }

  // 根据时间范围获取数据
  async getDataByTimeRange(source: string, startTime: number, endTime: number) {
    return this.hotItemRepository.getDataByTimeRange(
      source,
      startTime,
      endTime,
    );
  }

  // 获取最新数据
  async getLatestData(source?: string, limit: number = 50) {
    const options: SearchHistoryOptions = {
      source,
      page: 1,
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    };

    const result = await this.hotItemRepository.searchHistory(options);
    return result.data;
  }
}
