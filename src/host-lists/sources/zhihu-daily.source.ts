import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';

@Injectable()
@HotSource({
  name: 'zhihu-daily',
  title: '知乎日报',
  type: '推荐榜',
  link: 'https://daily.zhihu.com/',
  description: '每天三次，每次七分钟',
})
export class ZhihuDailySource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://daily.zhihu.com/api/4/news/latest';
    const result = await this.httpService.get<{
      stories: RouterType['zhihu-daily'][];
    }>({
      url,
      noCache: noCache ?? options.noCache,
      headers: {
        Referer: 'https://daily.zhihu.com/api/4/news/latest',
        Host: 'daily.zhihu.com',
      },
    });
    const list = (result?.data?.stories || []).filter((el) => el.type === 0);
    const data: HotListItem[] = list.map((v) => ({
      id: v.id,
      title: v.title,
      cover: v.images?.[0] ?? undefined,
      author: v.hint,
      hot: undefined,
      timestamp: undefined,
      url: v.url,
      mobileUrl: v.url,
    }));
    return {
      data,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
