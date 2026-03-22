/**
 * 同花顺财经
 */

import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import * as cheerio from 'cheerio';

@Injectable()
@HotSource({
  name: 'tonghuashun',
  title: '同花顺财经',
  type: '财经',
  link: 'https://www.10jqka.com.cn/',
})
export class TonghuashunSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://www.10jqka.com.cn/';
    const result = await this.httpService.get<string>({
      url,
      noCache,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const $ = cheerio.load(result.data);
    // 页面有多个 @container，逐个收集其内新闻链接后合并
    const $containers = $('[class*="@container"]');
    const list = $containers
      .toArray()
      .flatMap((container) => {
        const $c = $(container);
        const $links = $c.find('> a').add($c.find('.grid > a'));
        return $links.toArray();
      })
      .map((el) => {
        const $el = $(el);
        const rawUrl = $el.attr('href') || '';
        const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
        const id = fullUrl.match(/\/([^/]+)\.shtml$/)?.[1] || fullUrl;
        const title = $el.find('h3, h4').first().text().trim();
        const desc = $el.find('p').first().text().replace(/\s+/g, ' ').trim();
        const $img = $el.find('img[src*="thsi.cn"]').not('[src*="hot-news"]');
        const cover = $img.length ? $img.attr('src') : undefined;
        return {
          id,
          title,
          desc: desc || undefined,
          cover: cover
            ? cover.startsWith('//')
              ? `https:${cover}`
              : cover
            : undefined,
          url: fullUrl,
          mobileUrl: fullUrl,
        };
      });
    return {
      data: list,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
