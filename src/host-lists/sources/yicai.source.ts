import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import * as cheerio from 'cheerio';
import { headers } from 'src/utils/headers';

@Injectable()
@HotSource({
  name: 'yicai',
  title: '第一财经',
  type: '头条',
  link: 'https://www.yicai.com/',
  description: '头条',
})
export class YicaiSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://www.yicai.com/';
    const result = await this.httpService.get<string>({
      url,
      noCache: noCache ?? options.noCache,
      headers: {
        ...headers,
        Referer: 'https://www.yicai.com/',
      },
    });
    const $ = cheerio.load(result?.data);
    const list: RouterType['yicai'][] = [];
    $('#headlist a').each((index, element) => {
      const title = $(element).find('h2').text().trim();
      const link = $(element).attr('href');
      const imgSrc = $(element).find('img').attr('src');
      const description = $(element).find('p').text().trim();
      const time = $(element).find('.rightspan span:last-child').text().trim();
      const hot = Number($(element).find('.news_hot').text().trim());
      list.push({
        title,
        link,
        imgSrc,
        description,
        time,
        hot,
      });
    });
    const data: HotListItem[] = list.map((v) => ({
      id: v.link?.match(/\d+/)?.[0] || '',
      title: v.title,
      cover: v.imgSrc || undefined,
      desc: v.description,
      author: undefined,
      timestamp: Date.now(),
      hot: v.hot,
      url: `https://www.yicai.com${v.link}`,
      mobileUrl: `https://www.yicai.com${v.link}`,
    }));
    return {
      data,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
