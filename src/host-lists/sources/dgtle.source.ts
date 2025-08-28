import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface DgtleApiResponse {
  items: RouterType['dgtle'][];
}

@Injectable()
@HotSource({
  name: 'dgtle',
  title: '数字尾巴',
  type: '热门文章',
  description:
    '致力于分享美好数字生活体验，囊括你闻所未闻的最丰富数码资讯，触所未触最抢鲜产品评测，随时随地感受尾巴们各式数字生活精彩图文、摄影感悟、旅行游记、爱物分享。',
  link: 'https://www.dgtle.com/',
})
export class DgtleSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://opser.api.dgtle.com/v2/news/index';

    const result = await this.httpService.get<DgtleApiResponse>({
      url,
      noCache,
    });
    const list = result.data?.items || [];
    return {
      data: list.map((v) => ({
        id: v.id,
        title: v.title || v.content,
        desc: v.content,
        cover: v.cover,
        author: v.from,
        hot: v.membernum,
        timestamp: getTime(v.created_at),
        url: `https://www.dgtle.com/news-${v.id}-${v.type}.html`,
        mobileUrl: `https://m.dgtle.com/news-details/${v.id}`,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
