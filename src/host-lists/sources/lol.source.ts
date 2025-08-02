import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface LolApiResponse {
  data: {
    result: RouterType['lol'][];
  };
}

@Injectable()
@HotSource({
  name: 'lol',
  title: '英雄联盟',
  type: '更新公告',
  link: 'https://lol.qq.com/gicp/news/423/2/1334/1.html',
})
export class LolSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url =
      'https://apps.game.qq.com/cmc/zmMcnTargetContentList?r0=json&page=1&num=30&target=24&source=web_pc';

    const result = await this.httpService.get<LolApiResponse>({
      url,
      noCache,
      headers: {
        Accept: 'application/json',
      },
    });

    const list = result.data.data.result;

    return {
      data: list.map((v) => ({
        id: v.iDocID,
        title: v.sTitle,
        cover: `https:${v.sIMG}`,
        author: v.sAuthor,
        hot: Number(v.iTotalPlay),
        timestamp: getTime(v.sCreated),
        url: `https://lol.qq.com/news/detail.shtml?docid=${encodeURIComponent(v.iDocID)}`,
        mobileUrl: `https://lol.qq.com/news/detail.shtml?docid=${encodeURIComponent(v.iDocID)}`,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
