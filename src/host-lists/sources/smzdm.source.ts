import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

const typeMap: Record<string, string> = {
  '1': '今日热门',
  '7': '周热门',
  '30': '月热门',
};

interface SmzdmApiResponse {
  data: RouterType['smzdm'][];
}
@Injectable()
@HotSource({
  name: 'smzdm',
  title: '什么值得买',
  type: '热门榜',
  description:
    '什么值得买是一个中立的、致力于帮助广大网友买到更有性价比网购产品的最热门推荐网站。',
  link: 'https://www.smzdm.com/top/',
})
export class SmzdmSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type || '1';
    const url = `https://post.smzdm.com/rank/json_more/?unit=${type}`;
    const result = await this.httpService.get<SmzdmApiResponse>({
      url,
      noCache,
    });
    const list = result.data.data;
    return {
      data: list.map((v) => ({
        id: v.article_id,
        title: v.title,
        desc: v.content,
        cover: v.pic_url,
        author: v.nickname,
        hot: Number(v.collection_count),
        timestamp: getTime(v.time_sort),
        url: v.jump_link,
        mobileUrl: v.jump_link,
      })),
      type: typeMap[type],
      description:
        '什么值得买是一个中立的、致力于帮助广大网友买到更有性价比网购产品的最热门推荐网站。',
      params: {
        type: {
          name: '文章分类',
          type: typeMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
