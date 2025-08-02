import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import { parseRSS } from 'src/utils/parseRSS';

@Injectable()
@HotSource({
  name: 'nodeseek',
  title: 'NodeSeek',
  type: '最新',
  link: 'https://www.nodeseek.com/',
})
export class NodeseekSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://rss.nodeseek.com/';
    const result = await this.httpService.get<string>({ url, noCache });
    const list = await parseRSS(result.data);
    return {
      data: list.map((v, i) => ({
        id: v.guid || i,
        title: v.title || '',
        desc: v.content?.trim() || '',
        author: v.author,
        timestamp: getTime(v.pubDate || 0),
        hot: undefined,
        url: v.link || '',
        mobileUrl: v.link || '',
      })),
      type: '最新',
      params: {
        type: {
          name: '分类',
          type: {
            all: '所有',
          },
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
