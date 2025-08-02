import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

// 游戏分类
const gameMap: Record<string, string> = {
  '1': '崩坏3',
  '2': '原神',
  '3': '崩坏学园2',
  '4': '未定事件簿',
  '5': '大别野',
  '6': '崩坏：星穹铁道',
  '7': '暂无',
  '8': '绝区零',
};

// 榜单分类
const typeMap: Record<string, string> = {
  '1': '公告',
  '2': '活动',
  '3': '资讯',
};

interface MiyousheApiResponse {
  data: {
    list: RouterType['miyoushe'][];
  };
}

@Injectable()
@HotSource({
  name: 'miyoushe',
  title: '米游社',
  type: '最新动态',
  link: 'https://www.miyoushe.com/',
})
export class MiyousheSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const game = options?.game || '1';
    const type = options?.type || '1';
    const url = `https://bbs-api-static.miyoushe.com/painter/wapi/getNewsList?client_type=4&gids=${game}&last_id=&page_size=30&type=${type}`;
    const result = await this.httpService.get<MiyousheApiResponse>({
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
          hot: data.view_status || 0,
          url: `https://www.miyoushe.com/ys/article/${data.post_id}`,
          mobileUrl: `https://m.miyoushe.com/ys/#/article/${data.post_id}`,
        };
      }),
      type: `最新${typeMap[type] || ''}`,
      title: `米游社 · ${gameMap[game]} · ${typeMap[type]}`,
      params: {
        game: {
          name: '游戏分类',
          type: gameMap,
        },
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
