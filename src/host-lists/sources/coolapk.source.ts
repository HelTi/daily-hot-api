import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { genCoolapkHeaders } from 'src/token/coolapk';

interface CoolapkApiResponse {
  data: RouterType['coolapk'][];
}

@Injectable()
@HotSource({
  name: 'coolapk',
  title: '酷安',
  type: '热榜',
  link: 'https://www.coolapk.com/',
})
export class CoolapkSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = `https://api.coolapk.com/v6/page/dataList?url=/feed/statList?cacheExpires=300&statType=day&sortField=detailnum&title=今日热门&title=今日热门&subTitle=&page=1`;

    const result = await this.httpService.get<CoolapkApiResponse>({
      url,
      noCache,
      headers: genCoolapkHeaders(),
    });

    const list = result.data?.data || [];
    return {
      data: list.map((v) => ({
        id: v.id,
        title: v.message,
        cover: v.tpic,
        author: v.username,
        desc: v.ttitle,
        timestamp: undefined,
        hot: undefined,
        url: v.shareUrl,
        mobileUrl: v.shareUrl,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
