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
// 数据处理
const getNumbers = (text: string | undefined): number => {
  if (!text) return 0;
  const regex = /\d+/;
  const match = text.match(regex);
  if (match) {
    return Number(match[0]);
  } else {
    return 0;
  }
};

@Injectable()
@HotSource({
  name: 'douban-movie',
  title: '豆瓣电影',
  type: '新片榜',
  link: 'https://movie.douban.com/chart',
})
export class DoubanMovieSource implements HotListSource {
  private readonly logger = new Logger(DoubanMovieSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    try {
      const url = `https://movie.douban.com/chart/`;

      const result = await this.httpService.get<string>({
        url,
        noCache,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        },
      });

      const $ = load(result.data);
      const listDom = $('.article tr.item');

      const listData: HotListItem[] = listDom.toArray().map((item) => {
        const dom = $(item);
        const url = dom.find('a').attr('href') || undefined;
        const scoreDom = dom.find('.rating_nums');
        const score = scoreDom.length > 0 ? scoreDom.text() : '0.0';
        return {
          id: getNumbers(url),
          title: `【${score}】${dom.find('a').attr('title')}`,
          cover: dom.find('img').attr('src'),
          desc: dom.find('p.pl').text(),
          timestamp: undefined,
          hot: getNumbers(dom.find('span.pl').text()),
          url: url || `https://movie.douban.com/subject/${getNumbers(url)}/`,
          mobileUrl: `https://m.douban.com/movie/subject/${getNumbers(url)}/`,
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
}
