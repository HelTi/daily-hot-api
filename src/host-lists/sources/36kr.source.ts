import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface Kr36ApiResponse {
  data: {
    hotRankList: RouterType['36kr'][];
    videoList: RouterType['36kr'][];
    remarkList: RouterType['36kr'][];
    collectList: RouterType['36kr'][];
  };
}

const typeMap: Record<string, string> = {
  hot: '人气榜',
  video: '视频榜',
  comment: '热议榜',
  collect: '收藏榜',
};

@Injectable()
@HotSource({
  name: '36kr',
  title: '36氪',
  type: '热榜',
  link: 'https://m.36kr.com/hot-list-m',
})
export class Kr36Source implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type ?? 'hot';

    const url = `https://gateway.36kr.com/api/mis/nav/home/nav/rank/${type}`;
    const result = await this.httpService.post<Kr36ApiResponse>({
      url,
      noCache,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      data: {
        partner_id: 'wap',
        param: {
          siteId: 1,
          platformId: 2,
        },
        timestamp: new Date().getTime(),
      },
    });

    const listType = {
      hot: 'hotRankList',
      video: 'videoList',
      comment: 'remarkList',
      collect: 'collectList',
    };
    const list = result.data.data[listType[type || 'hot']] || [];

    return {
      data: list.map((v) => {
        const item = v.templateMaterial;
        return {
          id: v.itemId,
          title: item.widgetTitle,
          cover: item.widgetImage,
          author: item.authorName,
          timestamp: getTime(v.publishTime),
          hot: item.statCollect || undefined,
          url: `https://www.36kr.com/${type === 'video' ? 'video' : 'p'}/${v.itemId}`,
          mobileUrl: `https://m.36kr.com/${type === 'video' ? 'video' : 'p'}/${v.itemId}`,
        };
      }),
      type: typeMap[type] || '热搜',
      params: {
        type: {
          name: '热搜类别',
          type: typeMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
