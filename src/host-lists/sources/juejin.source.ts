import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';

const category_url = 'https://api.juejin.cn/tag_api/v1/query_category_briefs';

interface JuejinApiResponse {
  data: RouterType['juejin'][];
}

@Injectable()
@HotSource({
  name: 'juejin',
  title: '掘金',
  type: '热榜',
  link: 'https://juejin.cn/hot/articles',
})
export class JuejinSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  private async getCategory() {
    const res = await this.httpService.get<any>({
      url: category_url,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/1.0 Mobile/12F69 Safari/605.1.15',
      },
    });

    const data = res?.data?.data || [];
    const typeObj: Record<string, string> = {};
    typeObj['1'] = '综合';
    data.forEach((c: { category_id: string; category_name: string }) => {
      typeObj[c.category_id] = c.category_name;
    });

    return typeObj;
  }

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const typeMap = await this.getCategory();
    const type = options?.type ?? 1;

    const url = `https://api.juejin.cn/content_api/v1/content/article_rank?category_id=${type}&type=hot`;
    const result = await this.httpService.get<JuejinApiResponse>({
      url,
      noCache,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/1.0 Mobile/12F69 Safari/605.1.15',
      },
    });
    const list = result.data.data;

    return {
      data: list.map((v) => ({
        id: v.content.content_id,
        title: v.content.title,
        author: v.author.name,
        hot: v.content_counter.hot_rank,
        timestamp: undefined,
        url: `https://juejin.cn/post/${v.content.content_id}`,
        mobileUrl: `https://juejin.cn/post/${v.content.content_id}`,
      })),
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
