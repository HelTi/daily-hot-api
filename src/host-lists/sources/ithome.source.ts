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
  const match = url.match(/[html|live]\/(\d+)\.htm/);
  // 是否匹配成功
  if (match && match[1]) {
    return getId
      ? match[1]
      : `https://www.ithome.com/0/${match[1].slice(0, 3)}/${match[1].slice(3)}.htm`;
  }
  // 返回原始 URL
  return url;
};

@Injectable()
@HotSource({
  name: 'ithome',
  title: 'IT之家',
  type: '热榜',
  description: '爱科技，爱这里 - 前沿科技新闻网站',
  link: 'https://m.ithome.com/rankm/',
})
export class IthomeSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = `https://m.ithome.com/rankm/`;
    const result = await this.httpService.get<string>({
      url,
      noCache,
    });

    const $ = load(result.data);
    const listDom = $('.rank-box .placeholder');
    const listData = listDom.toArray().map((item) => {
      const dom = $(item);
      const href = dom.find('a').attr('href');
      return {
        id: href ? Number(replaceLink(href, true)) : 100000,
        title: dom.find('.plc-title').text().trim(),
        cover: dom.find('img').attr('data-original'),
        timestamp: getTime(dom.find('span.post-time').text().trim()),
        hot: Number(dom.find('.review-num').text().replace(/\D/g, '')),
        url: href ? replaceLink(href) : '',
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
