import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';

const typeMap: Record<string, string> = {
  '-1': '综合',
  '155': '番剧',
  '1': '动画',
  '60': '娱乐',
  '201': '生活',
  '58': '音乐',
  '123': '舞蹈·偶像',
  '59': '游戏',
  '70': '科技',
  '68': '影视',
  '69': '体育',
  '125': '鱼塘',
};

const rangeMap: Record<string, string> = {
  DAY: '今日',
  THREE_DAYS: '三日',
  WEEK: '本周',
};

@Injectable()
@HotSource({
  name: 'acfun',
  title: 'AcFun',
  type: '排行榜',
  link: 'https://www.acfun.cn/rank/list/',
})
export class AcFunSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type ?? '-1';
    const range = 'DAY'; // 默认使用 DAY

    const url = `https://www.acfun.cn/rest/pc-direct/rank/channel?channelId=${type === '-1' ? '' : type}&rankLimit=30&rankPeriod=${range}`;

    const result = await this.httpService.get<{
      rankList: RouterType['acfun'][];
    }>({
      url,
      noCache,
      headers: {
        Referer: `https://www.acfun.cn/rank/list/?cid=-1&pcid=${type}&range=${range}`,
      },
    });

    const list = result?.data?.rankList || [];

    return {
      data: list.map((v: RouterType['acfun']) => ({
        id: v.dougaId,
        title: v.contentTitle,
        desc: v.contentDesc,
        cover: v.coverUrl,
        author: v.userName,
        timestamp: v.contributeTime ? new Date(v.contributeTime).getTime() : 0,
        hot: v.likeCount,
        url: `https://www.acfun.cn/v/ac${v.dougaId}`,
        mobileUrl: `https://m.acfun.cn/v/?ac=${v.dougaId}`,
      })),
      type: `排行榜 · ${typeMap[type]}`,
      params: {
        type: {
          name: '频道',
          type: typeMap,
        },
        range: {
          name: '时间',
          type: rangeMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
