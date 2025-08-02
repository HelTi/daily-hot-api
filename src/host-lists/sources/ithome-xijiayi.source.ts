import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import { load } from 'cheerio';

// 链接处理
const replaceLink = (url: string, getId: boolean = false) => {
  const match = url.match(/https:\/\/www\.ithome\.com\/0\/(\d+)\/(\d+)\.htm/);
  if (match && match[1] && match[2]) {
    return getId
      ? match[1] + match[2]
      : `https://m.ithome.com/html/${match[1]}${match[2]}.htm`;
  }
  return url;
};

@Injectable()
@HotSource({
  name: 'ithome-xijiayi',
  title: 'IT之家「喜加一」',
  type: '最新动态',
  description: '最新最全的「喜加一」游戏动态尽在这里！',
  link: 'https://www.ithome.com/zt/xijiayi',
})
export class IthomeXijiaYiSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = `https://www.ithome.com/zt/xijiayi`;
    const result = await this.httpService.get<string>({
      url,
      noCache,
    });

    const $ = load(result.data);
    const listDom = $('.newslist li');
    const listData = listDom.toArray().map((item) => {
      const dom = $(item);
      const href = dom.find('a').attr('href');
      const time = dom.find('span.time').text().trim();
      const match = time.match(/'([^']+)'/);
      const dateTime = match ? match[1] : undefined;
      return {
        id: href ? Number(replaceLink(href, true)) : 100000,
        title: dom.find('.newsbody h2').text().trim(),
        desc: dom.find('.newsbody p').text().trim(),
        cover: dom.find('img').attr('data-original'),
        timestamp: getTime(dateTime || 0),
        hot: Number(dom.find('.comment').text().replace(/\D/g, '')),
        url: href || '',
        mobileUrl: href ? replaceLink(href) : '',
      };
    });

    return {
      data: listData,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
