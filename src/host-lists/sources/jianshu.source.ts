import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { load } from 'cheerio';

// 获取 ID
const getID = (url: string) => {
  if (!url) return 'undefined';
  const match = url.match(/([^/]+)$/);
  return match ? match[1] : 'undefined';
};

@Injectable()
@HotSource({
  name: 'jianshu',
  title: '简书',
  type: '热门推荐',
  description: '一个优质的创作社区',
  link: 'https://www.jianshu.com/',
})
export class JianshuSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = `https://www.jianshu.com/`;
    const result = await this.httpService.get<string>({
      url,
      noCache,
      headers: {
        Referer: 'https://www.jianshu.com',
      },
    });

    const $ = load(result.data);
    const listDom = $('ul.note-list li');
    const listData = listDom.toArray().map((item) => {
      const dom = $(item);
      const href = dom.find('a').attr('href') || '';
      return {
        id: getID(href),
        title: dom.find('a.title').text()?.trim(),
        cover: dom.find('img').attr('src'),
        desc: dom.find('p.abstract').text()?.trim(),
        author: dom.find('a.nickname').text()?.trim(),
        hot: undefined,
        timestamp: undefined,
        url: `https://www.jianshu.com${href}`,
        mobileUrl: `https://www.jianshu.com${href}`,
      };
    });

    return {
      data: listData,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
