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

interface WeiboApiResponse {
  data: { realtime: RouterType['weibo'][] };
}

@Injectable()
@HotSource({
  name: 'weibo',
  title: '微博',
  type: '热搜榜',
  link: 'https://s.weibo.com/top/summary/',
  description: '实时热点，每分钟更新一次',
})
export class WeiboSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://weibo.com/ajax/side/hotSearch';
    const result = await this.httpService.get<WeiboApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
      ttl: 60,
    });
    const list = result?.data?.data?.realtime || [];
    const data: HotListItem[] = list.map((v) => {
      const key = v.word_scheme ? v.word_scheme : `#${v.word}`;
      return {
        id: v.mid,
        title: v.word,
        desc: v.note || key,
        author: v.flag_desc,
        timestamp: getTime(v.onboard_time),
        hot: v.num,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(key)}&t=31&band_rank=1&Refer=top`,
        mobileUrl: `https://s.weibo.com/weibo?q=${encodeURIComponent(key)}&t=31&band_rank=1&Refer=top`,
      };
    });
    return {
      data,
      type: '热搜榜',
      description: '实时热点，每分钟更新一次',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
