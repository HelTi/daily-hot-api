import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from '../../utils/getTime';

interface YystvApiResponse {
  data: RouterType['yystv'][];
}

@Injectable()
@HotSource({
  name: 'yystv',
  title: '游研社',
  type: '全部文章',
  link: 'https://www.yystv.cn/docs',
  description:
    '游研社是以游戏内容为主的新媒体，出品内容包括大量游戏、动漫有关的研究文章和社长聊街机、社长说、游研剧场、老四强等系列视频内容。',
})
export class YystvSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://www.yystv.cn/home/get_home_docs_by_page';
    const result = await this.httpService.get<YystvApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
    });
    const list = result?.data?.data || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.id,
      title: v.title,
      cover: v.cover,
      author: v.author,
      hot: undefined,
      timestamp: getTime(v.createtime),
      url: `https://www.yystv.cn/p/${v.id}`,
      mobileUrl: `https://www.yystv.cn/p/${v.id}`,
    }));
    return {
      data,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
