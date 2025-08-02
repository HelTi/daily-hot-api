import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface Jin10ApiResponse {
  list: RouterType['jin10'][];
}

@Injectable()
@HotSource({
  name: 'jin10',
  title: '金十数据',
  type: '推荐榜',
  description: '金十数据',
  link: 'https://www.jin10.com/',
})
export class Jin10Source implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://cdn.jin10.com/json/index/latest_news.json';

    const result = await this.httpService.get<Jin10ApiResponse>({
      url,
      noCache,
    });

    const list = result.data.list || [];

    return {
      data: list.map((v) => {
        return {
          id: v.id,
          title: v.title,
          cover: v.mobile_thumbs?.[0] || undefined,
          desc: v?.introduction,
          author: undefined,
          timestamp: getTime(v.display_datetime),
          hot: null,
          url: v?.source_url
            ? v.source_url
            : `https://xnews.jin10.com/details/${v.id}`,
          mobileUrl: v?.source_url
            ? v.source_url
            : `https://xnews.jin10.com/details/${v.id}`,
        };
      }),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
