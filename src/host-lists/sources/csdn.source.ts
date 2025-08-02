import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { genCoolapkHeaders } from 'src/token/coolapk';
import { getTime } from 'src/utils/getTime';

interface CsdnApiResponse {
  data: RouterType['csdn'][];
}

@Injectable()
@HotSource({
  name: 'csdn',
  title: 'CSDN',
  type: '排行榜',
  description: '专业开发者社区',
  link: 'https://www.csdn.net/',
})
export class CsdnSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url =
      'https://blog.csdn.net/phoenix/web/blog/hot-rank?page=0&pageSize=30';

    const result = await this.httpService.get<CsdnApiResponse>({
      url,
      noCache,
      headers: genCoolapkHeaders(),
    });

    const list = result.data?.data || [];
    return {
      data: list.map((v) => ({
        id: v.productId,
        title: v.articleTitle,
        cover: v.picList?.[0] || undefined,
        desc: undefined,
        author: v.nickName,
        timestamp: getTime(v.period),
        hot: Number(v.hotRankScore),
        url: v.articleDetailUrl,
        mobileUrl: v.articleDetailUrl,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
