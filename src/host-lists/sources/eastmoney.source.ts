import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import { headers } from 'src/utils/headers';

const SITE_URL = 'https://www.eastmoney.com/';

const getArticleId = (url: string) => {
  return url.match(/\/a\/(\d+)\.html/)?.[1] || url;
};

const getDateFromArticleId = (id: string) => {
  const date = id
    .match(/^(\d{4})(\d{2})(\d{2})/)
    ?.slice(1)
    .join('-');

  return date ? getTime(date) : undefined;
};

@Injectable()
@HotSource({
  name: 'eastmoney',
  title: '东方财富',
  type: '热点',
  link: SITE_URL,
})
export class EastmoneySource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const result = await this.httpService.get<string>({
      url: SITE_URL,
      noCache: noCache ?? options.noCache,
      headers: {
        ...headers,
        Referer: SITE_URL,
      },
    });

    const $ = load(result.data);
    const seen = new Set<string>();
    const data = $('.cjdd .cjdd_c .nlist a[href*="finance.eastmoney.com/a/"]')
      .toArray()
      .map((item) => {
        const link = $(item);
        const url = link.attr('href')?.trim() || '';
        const id = getArticleId(url);

        return {
          id,
          title: link.text().replace(/\s+/g, ' ').trim(),
          timestamp: getDateFromArticleId(id),
          hot: undefined,
          url,
          mobileUrl: url,
        };
      })
      .filter((item) => {
        if (!item.title || !item.url || seen.has(item.url)) {
          return false;
        }

        seen.add(item.url);
        return true;
      });

    return {
      data,
      type: '热点',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
