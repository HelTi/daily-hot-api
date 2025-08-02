import { Injectable, Logger } from '@nestjs/common';
import { load } from 'cheerio';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from '../../utils/getTime';

@Injectable()
@HotSource({
  name: 'douban-group',
  title: '豆瓣讨论',
  type: '讨论精选',
  link: 'https://www.douban.com/group/explore',
})
export class DoubanGroupSource implements HotListSource {
  private readonly logger = new Logger(DoubanGroupSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    try {
      const url = 'https://www.douban.com/group/explore';
      const result = await this.httpService.get<string>({
        url,
        noCache,
      });

      const $ = load(result.data);
      const listDom = $('.article .channel-item');

      const listData: HotListItem[] = listDom.toArray().map((item) => {
        const dom = $(item);
        const urlAttr = dom.find('h3 a').attr('href') || '';
        const id = this.getNumbers(urlAttr);

        return {
          id,
          title: dom.find('h3 a').text().trim(),
          cover: dom.find('.pic-wrap img').attr('src') || '',
          desc: dom.find('.block p').text().trim(),
          timestamp: getTime(dom.find('span.pubtime').text().trim()) || 0,
          hot: 0,
          url: urlAttr || `https://www.douban.com/group/topic/${id}`,
          mobileUrl: `https://m.douban.com/group/topic/${id}/`,
        };
      });

      return {
        data: listData,
        params: {
          type: {
            name: '讨论类别',
            type: {},
          },
        },
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Failed to get douban group list: ${errorMessage}`);

      return {
        data: [],
        params: {
          type: {
            name: '讨论类别',
            type: {},
          },
        },
        fromCache: false,
        updateTime: 0,
      };
    }
  }

  /**
   * 从URL中提取数字ID
   * @param text URL字符串
   * @returns 提取的数字ID
   */
  private getNumbers(text: string | undefined): string {
    if (!text) return '100000000';
    const regex = /\d+/;
    const match = text.match(regex);
    if (match) {
      return match[0];
    } else {
      return '100000000';
    }
  }
}
