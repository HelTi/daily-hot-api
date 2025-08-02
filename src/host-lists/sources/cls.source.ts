import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from '../../utils/getTime';
import { headers } from 'src/utils/headers';

interface ClsApiResponse {
  data: RouterType['cls'][];
}

@Injectable()
@HotSource({
  name: 'cls',
  title: '财联社',
  type: '头条',
  link: 'https://www.cls.cn/',
})
export class ClsSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url =
      'https://www.cls.cn/v3/depth/list/1000?app=CailianpressWeb&id=1000&last_time=&os=web&rn=20&sv=8.4.6&sign=a7aebfb9c660af8779033e0aa8f03a58';
    const result = await this.httpService.get<ClsApiResponse>({
      url,
      noCache,
      headers: {
        ...headers,
        Referer: 'https://www.cls.cn/depth?id=1000',
        Host: 'www.cls.cn',
      },
    });

    const list = result.data?.data || [];
    return {
      data: list.map((v) => ({
        id: v.id,
        title: v.title,
        cover: v.image || undefined,
        desc: v.brief,
        author: v.source,
        timestamp: getTime(v.ctime),
        hot: Number(v.reading_num),
        url: `https://www.cls.cn/detail/${v.id}`,
        mobileUrl: `https://www.cls.cn/detail/${v.id}`,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
