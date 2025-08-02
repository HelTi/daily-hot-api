import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface HonkaiApiResponse {
  data: {
    list: RouterType['miyoushe'][];
  };
}

const typeMap: Record<string, string> = {
  1: '公告',
  2: '活动',
  3: '资讯',
};

@Injectable()
@HotSource({
  name: 'honkai',
  title: '崩坏3',
  type: '最新动态',
  link: 'https://www.miyoushe.com/bh3/home/6',
})
export class HonkaiSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type ?? 1;

    const url = `https://bbs-api-static.miyoushe.com/painter/wapi/getNewsList?client_type=4&gids=1&last_id=&page_size=20&type=${type}`;
    const result = await this.httpService.get<HonkaiApiResponse>({
      url,
      noCache,
    });

    const list = result.data.data.list || [];

    return {
      data: list.map((v) => {
        const data = v.post;
        return {
          id: data.post_id,
          title: data.subject,
          desc: data.content,
          cover: data.cover || data?.images?.[0],
          author: v.user?.nickname || undefined,
          timestamp: getTime(data.created_at),
          hot: data.view_status,
          url: `https://www.miyoushe.com/bh3/article/${data.post_id}`,
          mobileUrl: `https://m.miyoushe.com/bh3/#/article/${data.post_id}`,
        };
      }),
      type: typeMap[type] || '热搜',
      params: {
        type: {
          name: '榜单分类',
          type: typeMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
