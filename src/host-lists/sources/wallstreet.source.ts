import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from '../../utils/getTime';

interface WallstreetApiResponse {
  data: { day_items: RouterType['wallstreet'][] };
}

@Injectable()
@HotSource({
  name: 'wallstreetcn',
  title: '华尔街见闻',
  type: '热门文章',
  link: 'https://wallstreetcn.com/',
  description: '热门文章',
})
export class WallstreetSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url =
      'https://api-one-wscn.awtmt.com/apiv1/content/articles/hot?period=all';
    const result = await this.httpService.get<WallstreetApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
      headers: {
        Referer: 'https://wallstreetcn.com/',
      },
    });
    const list = result?.data?.data?.day_items || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.id,
      title: v.title,
      timestamp: getTime(v?.display_time),
      hot: v?.pageviews,
      url: v?.uri,
      mobileUrl: v?.uri,
    }));
    return {
      data,
      type: '热门文章',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
