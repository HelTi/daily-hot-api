/**
 * 格隆汇
 */

import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import * as cheerio from 'cheerio';
import { getTime } from 'src/utils/getTime';

const BASE = 'https://www.gelonghui.com';

function resolveUrl(href: string | undefined): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  return `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

function articlePath(href: string): string {
  try {
    if (href.startsWith('http')) return new URL(href).pathname;
  } catch {
    /* ignore */
  }
  return href.split('?')[0];
}

@Injectable()
@HotSource({
  name: 'gelonghui',
  title: '格隆汇',
  type: '财经',
  link: 'https://www.gelonghui.com/',
})
export class GelonghuiSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://www.gelonghui.com/';
    const result = await this.httpService.get<string>({
      url,
      noCache,
      responseType: 'text',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const $ = cheerio.load(result.data);
    const list = $('ul.article-ul li.article-li')
      .toArray()
      .map((el) => {
        const $li = $(el);
        const $mainLink = $li.find('.detail-right > a').first();
        const rawHref =
          $mainLink.attr('href') ||
          $li.find('a.detail-left').attr('href') ||
          '';
        const fullUrl = resolveUrl(rawHref);
        const path = articlePath(rawHref);
        const idMatch = path.match(/\/p\/(\d+)/);
        const id = idMatch ? idMatch[1] : fullUrl;
        const title = $mainLink.find('h2').text().replace(/\s+/g, ' ').trim();
        const desc = $mainLink
          .find('summary')
          .text()
          .replace(/\s+/g, ' ')
          .trim();

        const cover = $li.find('.detail-left img').attr('data-src');

        const author = $li
          .find('.source-time .source')
          .text()
          .replace(/\s+/g, ' ')
          .trim();

        return {
          id,
          title,
          desc: desc || undefined,
          cover,
          author: author || undefined,
          url: fullUrl,
          mobileUrl: fullUrl,
          timestamp: getTime(+new Date()),
        };
      })
      .filter((item) => item.title && item.url);

    return {
      data: list,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
