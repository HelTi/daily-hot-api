import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import { parseRSS } from 'src/utils/parseRSS';

const typeMap: Record<string, string> = {
  hot: '最新热门',
  digest: '最新精华',
  new: '最新回复',
  newthread: '最新发表',
};

@Injectable()
@HotSource({
  name: 'hostloc',
  title: '全球主机交流论坛',
  type: '最新动态',
  link: 'https://www.hostloc.com/forum.php',
})
export class HostlocSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type ?? 'hot';

    const url = `https://hostloc.com/forum.php?mod=guide&view=${type}&rss=1`;
    const result = await this.httpService.get<string>({
      url,
      noCache,
      headers: {
        userAgent:
          'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
      },
    });

    const list = await parseRSS(result.data);

    return {
      data: list.map((v, i) => {
        return {
          id: v.guid || i.toString(),
          title: v.title || '',
          desc: v.content || '',
          author: v.author || '',
          timestamp: getTime(v.pubDate || 0),
          hot: undefined,
          url: v.link || '',
          mobileUrl: v.link || '',
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
