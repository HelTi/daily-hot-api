import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface SsApiResponse {
  data: RouterType['sspai'][];
}

@Injectable()
@HotSource({
  name: 'sspai',
  title: '少数派',
  type: '热榜',
  link: 'https://sspai.com/',
})
export class SsPaiSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type || '热门文章';
    const url = `https://sspai.com/api/v1/article/tag/page/get?limit=40&tag=${type}`;

    const result = await this.httpService.get<SsApiResponse>({
      url,
      noCache,
    });
    const list = result.data?.data || [];
    return {
      data: list.map((v) => ({
        id: v.id,
        title: v.title,
        desc: v.summary,
        cover: v.banner,
        author: v.author.nickname,
        timestamp: getTime(v.released_time),
        hot: v.like_count,
        url: `https://sspai.com/post/${v.id}`,
        mobileUrl: `https://sspai.com/post/${v.id}`,
      })),
      params: {
        type: {
          name: '分类',
          type: {
            热门文章: '热门文章',
            应用推荐: '应用推荐',
            生活方式: '生活方式',
            效率技巧: '效率技巧',
            少数派播客: '播客',
          },
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
