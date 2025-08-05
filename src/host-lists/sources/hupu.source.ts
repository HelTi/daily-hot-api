import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';

const typeMap: Record<string, string> = {
  1: '主干道',
  6: '恋爱区',
  11: '校园区',
  12: '历史区',
  612: '摄影区',
  21: '股票区',
  10: '职场区',
};

@Injectable()
@HotSource({
  name: 'hupu',
  title: '虎扑',
  type: '步行街热帖',
  link: 'https://bbs.hupu.com/all-gambia',
})
export class HupuSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options.type || '1';
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const cursor = options.cursor || undefined;
    const url = `https://m.hupu.com/api/v2/bbs/topicThreads?topicId=${type}&page=${page}&pageSize=${pageSize}${cursor ? `&cursor=${cursor}` : ''}`;
    const result = await this.httpService.get<{
      data: { topicThreads: RouterType['hupu'][]; nextCursor?: string };
    }>({
      url,
      noCache: noCache ?? options.noCache,
    });
    const list = result?.data?.data?.topicThreads || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.tid,
      title: v.title,
      author: v.username,
      hot: v.replies,
      timestamp: undefined,
      url: `https://bbs.hupu.com/${v.tid}.html`,
      mobileUrl: v.url,
    }));
    return {
      data,
      type: '步行街热帖',
      params: {
        type: {
          name: '榜单分类',
          type: typeMap,
        },
      },
      nextCursor: result?.data?.data?.nextCursor,
    };
  }
}
