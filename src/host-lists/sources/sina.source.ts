import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { parseChineseNumber } from 'src/utils/getNum';

const typeMap: Record<string, string> = {
  all: '新浪热榜',
  hotcmnt: '热议榜',
  minivideo: '视频热榜',
  ent: '娱乐热榜',
  ai: 'AI热榜',
  auto: '汽车热榜',
  mother: '育儿热榜',
  fashion: '时尚热榜',
  travel: '旅游热榜',
  esg: 'ESG热榜',
};

@Injectable()
@HotSource({
  name: 'sina',
  title: '新浪网',
  type: '热榜',
  description: '热榜太多，一个就够',
  link: 'https://sinanews.sina.cn/',
})
export class SinaSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type || 'all';
    const url = `https://newsapp.sina.cn/api/hotlist?newsId=HB-1-snhs%2Ftop_news_list-${type}`;
    const result = await this.httpService.get<any>({ url, noCache });
    const list = result.data.data.hotList;
    return {
      data: list.map((v: RouterType['sina']) => {
        const base = v.base;
        const info = v.info;
        return {
          id: base.base.uniqueId,
          title: info.title,
          desc: undefined,
          author: undefined,
          timestamp: undefined,
          hot: parseChineseNumber(info.hotValue),
          url: base.base.url,
          mobileUrl: base.base.url,
        };
      }),
      type: typeMap[type],
      description: '热榜太多，一个就够',
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
