import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

@Injectable()
@HotSource({
  name: 'qq-news',
  title: '腾讯新闻',
  type: '热点榜',
  link: 'https://news.qq.com/',
})
export class QQNewsSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://r.inews.qq.com/gw/event/hot_ranking_list?page_size=50';
    const result = await this.httpService.get<any>({ url, noCache });
    const list = result.data.idlist[0].newslist.slice(1);
    return {
      data: list.map((v: RouterType['qq-news']) => ({
        id: v.id,
        title: v.title,
        desc: v.abstract,
        cover: v.miniProShareImage,
        author: v.source,
        hot: v.hotEvent.hotScore,
        timestamp: getTime(v.timestamp),
        url: `https://new.qq.com/rain/a/${v.id}`,
        mobileUrl: `https://view.inews.qq.com/k/${v.id}`,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
