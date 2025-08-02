import { HttpClientService } from '../../http/http.service';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { GetListOptions } from './source.types';
import { Injectable } from '@nestjs/common';
import { RouterType } from './source.types';
import * as cheerio from 'cheerio';
import { HotSource } from '../decorators/hot-source.decorator';

@Injectable()
@HotSource({
  name: 'caixin',
  title: '财新网',
  type: '排行榜',
  link: 'https://www.caixin.com/',
})
export class CaixinSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://www.caixin.com/';
    const result = await this.httpService.get<string>({
      url,
      noCache,
    });
    const $ = cheerio.load(result?.data);
    const list: RouterType['caixin'][] = [];

    $('.news_list dl').each((index, element) => {
      const title = $(element).find('dd p a').text().trim();
      const link = $(element).find('dd p a').attr('href');
      const imgSrc = $(element).find('dt img').attr('src');
      const author = $(element).find('dd span').text().trim();

      list.push({
        title,
        link,
        imgSrc,
        author,
      });
    });
    return {
      data: list.map((v) => ({
        id: v.link?.match(/\d+/)?.[0] || '',
        title: v.title,
        cover: v.imgSrc || undefined,
        desc: '',
        author: v.author,
        timestamp: undefined,
        hot: undefined,
        url: v.link || '',
        mobileUrl: v.link || '',
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
