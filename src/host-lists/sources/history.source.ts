import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getCurrentDateTime } from '../../utils/getTime';
import { RouterType } from './source.types';
import { load } from 'cheerio';

/**
 * 历史上的今天数据源
 *
 * 支持的参数：
 * - type: 日期格式 MM-DD（如 "01-01"）
 * - month: 月份（如 "01"）
 * - day: 日期（如 "01"）
 *
 * 使用示例：
 * - /history?type=01-01 （1月1日）
 * - /history?month=01&day=01 （1月1日）
 * - /history （当前日期）
 */
@Injectable()
@HotSource({
  name: 'history',
  title: '历史上的今天',
  type: '历史',
  link: 'https://baike.baidu.com/calendar',
})
export class HistorySource implements HotListSource {
  private readonly logger = new Logger(HistorySource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    // 获取日期参数，支持多种方式：
    // 1. 通过单独的 month 和 day 参数
    // 2. 通过 type 字段（格式为 MM-DD）
    // 3. 默认使用当前日期
    const currentDate = getCurrentDateTime(true);
    let month = (options as any)?.month || currentDate.month;
    let day = (options as any)?.day || currentDate.day;

    // 如果没有单独的 month/day 参数，尝试从 type 字段解析
    if (!(options as any)?.month && !(options as any)?.day && options?.type) {
      const dateParts = options.type.split('-');
      if (dateParts.length === 2) {
        month = dateParts[0];
        day = dateParts[1];
      }
    }

    try {
      const listData = await this.fetchHistoryData(month, day, noCache);

      return {
        data: listData.map((item, index) => ({
          id: index,
          title: load(item.title).text().trim(),
          desc: load(item.desc).text().trim(),
          cover: item.cover ? item.pic_share : undefined,
          author: item.year,
          timestamp: undefined,
          hot: undefined,
          url: item.link,
          mobileUrl: item.link,
        })),
        type: `${month}-${day}`,
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to fetch history data for ${month}-${day}`,
        error,
      );
      throw new Error(`Failed to fetch history data: ${error.message}`);
    }
  }

  private async fetchHistoryData(
    month: string,
    day: string,
    noCache?: boolean,
  ): Promise<RouterType['history'][]> {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const url = `https://baike.baidu.com/cms/home/eventsOnHistory/${monthStr}.json`;

    try {
      const result = await this.httpService.get<{
        data: RouterType['history'][];
      }>({
        url,
        noCache,
        params: {
          _: new Date().getTime(),
        },
        ttl: 60 * 60 * 12, // 12小时缓存
        timeout: 10000, // 10秒超时
      });

      const list = result.data?.[monthStr]?.[monthStr + dayStr] || [];
      this.logger.log(
        `✅ Successfully fetched ${list.length} history events for ${month}-${day}`,
      );

      return list as RouterType['history'][];
    } catch (error) {
      this.logger.error(`❌ Failed to fetch history data from API`, error);
      throw error;
    }
  }
}
