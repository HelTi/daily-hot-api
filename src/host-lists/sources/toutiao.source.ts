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

interface ToutiaoApiResponse {
  data: RouterType['toutiao'][];
}

@Injectable()
@HotSource({
  name: 'toutiao',
  title: '今日头条',
  type: '热榜',
  link: 'https://www.toutiao.com/',
})
export class ToutiaoSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url =
      'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc';
    const result = await this.httpService.get<ToutiaoApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
    });
    const list = result?.data?.data || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.ClusterIdStr,
      title: v.Title,
      cover: v.Image?.url,
      timestamp: getTime(v.ClusterIdStr),
      hot: Number(v.HotValue),
      url: `https://www.toutiao.com/trending/${v.ClusterIdStr}/`,
      mobileUrl: `https://api.toutiaoapi.com/feoffline/amos_land/new/html/main/index.html?topic_id=${v.ClusterIdStr}`,
    }));
    return {
      data,
      type: '热榜',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
