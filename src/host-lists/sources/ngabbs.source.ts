import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface NgabbsApiResponse {
  result: [RouterType['ngabbs'][]];
}

@Injectable()
@HotSource({
  name: 'ngabbs',
  title: 'NGA',
  type: '论坛热帖',
  description: '精英玩家俱乐部',
  link: 'https://ngabbs.com/',
})
export class NgabbsSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url =
      'https://ngabbs.com/nuke.php?__lib=load_topic&__act=load_topic_reply_ladder2&opt=1&all=1';
    const result = await this.httpService.post<NgabbsApiResponse>({
      url,
      noCache,
      headers: {
        Accept: '*/*',
        Host: 'ngabbs.com',
        Referer: 'https://ngabbs.com/',
        Connection: 'keep-alive',
        'Content-Length': '11',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'zh-Hans-CN;q=1',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
        'X-User-Agent': 'NGA_skull/7.3.1(iPhone13,2;iOS 17.2.1)',
      },
      data: {
        __output: '14',
      },
    });
    const list = result.data.result[0] || [];
    return {
      data: list.map((v) => ({
        id: v.tid,
        title: v.subject,
        author: v.author,
        hot: v.replies,
        timestamp: getTime(v.postdate),
        url: `https://bbs.nga.cn${v.tpcurl}`,
        mobileUrl: `https://bbs.nga.cn${v.tpcurl}`,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
