import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';

const JD_HOME_URL = 'https://www.jd.com/';

const rankLinkPattern =
  /\/\/www\.jd\.com\/(?:phb|jxinfo|zxnews)\/[A-Za-z0-9_/.-]+\.html/;

const toAbsoluteUrl = (url: string) => {
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://www.jd.com${url}`;
  return url;
};

const toMobileSearchUrl = (keyword: string) =>
  `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(
    keyword,
  )}&sort_type=sort_totalsales15_desc`;

@Injectable()
@HotSource({
  name: 'jd',
  title: '京东',
  type: '热销总榜',
  description:
    '京东首页官方曝光的排行榜与热销相关入口，条目链接到京东官方页面。',
  link: JD_HOME_URL,
})
export class JdSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const result = await this.httpService.get<string>({
      url: JD_HOME_URL,
      noCache,
      headers: {
        Referer: JD_HOME_URL,
      },
    });

    const $ = load(result.data);
    const seen = new Set<string>();
    const list: { title: string; url: string }[] = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim().replace(/\s+/g, ' ');

      if (!href || !title) return;

      const url = toAbsoluteUrl(href);
      if (!rankLinkPattern.test(url) || seen.has(url)) return;

      seen.add(url);
      list.push({ title, url });
    });

    return {
      data: list.map((item, index) => ({
        id: item.url,
        title: item.title,
        desc: '京东官方排行榜或热销相关入口',
        hot: index + 1,
        timestamp: 0,
        url: item.url,
        mobileUrl: toMobileSearchUrl(item.title),
      })),
      type: '热销总榜',
      description:
        '京东首页官方曝光的排行榜与热销相关入口，条目链接到京东官方页面。',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
