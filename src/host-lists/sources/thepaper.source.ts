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

type ThepaperApiResponse = {
  data: {
    hotNews: RouterType['thepaper'][];
  };
};

@Injectable()
@HotSource({
  name: 'thepaper',
  title: '澎湃新闻',
  type: '热榜',
  link: 'https://www.thepaper.cn/',
})
export class ThepaperSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar';
    const result = await this.httpService.get<ThepaperApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
    });
    const list = result?.data?.data?.hotNews || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.contId,
      title: v.name,
      cover: v.pic,
      hot: Number(v.praiseTimes),
      timestamp: getTime(v.pubTimeLong),
      url: `https://www.thepaper.cn/newsDetail_forward_${v.contId}`,
      mobileUrl: `https://m.thepaper.cn/newsDetail_forward_${v.contId}`,
    }));
    return {
      data,
      type: '热榜',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
