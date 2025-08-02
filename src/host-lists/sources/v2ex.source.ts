import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';

const typeMap = {
  hot: '最热主题',
  latest: '最新主题',
};

@Injectable()
@HotSource({
  name: 'v2ex',
  title: 'V2EX',
  type: '主题榜',
  link: 'https://www.v2ex.com/',
})
export class V2exSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options.type || 'hot';
    const url = `https://www.v2ex.com/api/topics/${type}.json`;
    const result = await this.httpService.get<RouterType['v2ex'][]>({
      url,
      noCache: noCache ?? options.noCache,
    });
    const list = result?.data || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.id,
      title: v.title,
      desc: v.content,
      author: v.member?.username,
      timestamp: undefined,
      hot: v.replies,
      url: v.url,
      mobileUrl: v.url,
    }));
    return {
      data,
      type: '主题榜',
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
