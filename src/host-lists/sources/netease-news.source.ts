import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface NeteaseNewsApiResponse {
  data: {
    list: RouterType['netease-news'][];
  };
}

@Injectable()
@HotSource({
  name: 'netease-news',
  title: '网易新闻',
  type: '热点榜',
  link: 'https://m.163.com/hot',
})
export class NeteaseNewsSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://m.163.com/fe/api/hot/news/flow';
    const result = await this.httpService.get<NeteaseNewsApiResponse>({
      url,
      noCache,
    });
    const list = result.data.data.list || [];
    return {
      data: list.map((v) => ({
        id: v.docid,
        title: v.title,
        cover: v.imgsrc,
        author: v.source,
        hot: undefined,
        timestamp: getTime(v.ptime),
        url: `https://www.163.com/dy/article/${v.docid}.html`,
        mobileUrl: `https://m.163.com/dy/article/${v.docid}.html`,
      })),
      type: '热点榜',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
