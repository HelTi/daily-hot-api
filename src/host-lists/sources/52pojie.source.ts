import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import { parseRSS } from 'src/utils/parseRSS';
import * as iconv from 'iconv-lite';

const typeMap: Record<string, string> = {
  digest: '最新精华',
  hot: '最新热门',
  new: '最新回复',
  newthread: '最新发表',
};

@Injectable()
@HotSource({
  name: '52pojie',
  title: '吾爱破解',
  type: '热榜',
  link: 'https://www.52pojie.cn/',
})
export class PojieSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type ?? 'digest';

    const url = `https://www.52pojie.cn/forum.php?mod=guide&view=${type}&rss=1`;
    const result = await this.httpService.get<ArrayBuffer>({
      url,
      noCache,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
      },
    });

    // 转码 GBK 到 UTF-8
    const utf8Data = iconv.decode(Buffer.from(result.data), 'gbk');
    const list = await parseRSS(utf8Data);

    return {
      data: list.map((v, i) => ({
        id: v.guid || i.toString(),
        title: v.title || '',
        desc: v.content?.trim() || '',
        author: v.author || '',
        timestamp: getTime(v.pubDate || 0),
        hot: undefined,
        url: v.link || '',
        mobileUrl: v.link || '',
      })),
      type: typeMap[type] || '热榜',
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
