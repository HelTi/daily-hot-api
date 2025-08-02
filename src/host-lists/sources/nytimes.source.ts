import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import { parseRSS } from 'src/utils/parseRSS';

const areaMap: Record<string, string> = {
  china: '中文网',
  global: '全球版',
};

@Injectable()
@HotSource({
  name: 'nytimes',
  title: '纽约时报',
  type: '新闻',
  link: 'https://www.nytimes.com/',
})
export class NyTimesSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const area = options?.area || 'china';
    const url =
      area === 'china'
        ? 'https://cn.nytimes.com/rss/'
        : 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml';
    const result = await this.httpService.get<string>({
      url,
      noCache,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
      },
    });
    const list = await parseRSS(result.data);
    return {
      data: list.map((v, i) => ({
        id: v.guid || i,
        title: v.title || '',
        desc: v.content?.trim() || '',
        author: v.author,
        timestamp: getTime(v.pubDate || 0),
        hot: undefined,
        url: v.link || '',
        mobileUrl: v.link || '',
      })),
      type: areaMap[area],
      params: {
        type: {
          name: '地区分类',
          type: areaMap,
        },
        area: {
          name: '地区分类',
          type: areaMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
