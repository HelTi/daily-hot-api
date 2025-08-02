import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { TokenService } from 'src/token/token.service';
import { sign } from 'src/token/tools';

interface _51ctoApiResponse {
  data: {
    data: {
      list: RouterType['51cto'][];
    };
  };
}

@Injectable()
@HotSource({
  name: '51cto',
  title: '51CTO',
  type: '热榜',
  link: 'https://www.51cto.com/',
})
export class _51ctoSource implements HotListSource {
  constructor(
    private readonly httpService: HttpClientService,
    private readonly tokenService: TokenService,
  ) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = `https://api-media.51cto.com/index/index/recommend`;
    const params = {
      page: 1,
      page_size: 50,
      limit_time: 0,
      name_en: '',
    };
    const timestamp = Date.now();
    const token = await this.tokenService.get51ctoToken();
    const result = await this.httpService.get<_51ctoApiResponse>({
      url,
      noCache,
      params: {
        ...params,
        timestamp,
        token,
        sign: sign('index/index/recommend', params, timestamp, token),
      },
    });
    const list = result.data?.data?.data?.list || [];
    return {
      data: list.map((v) => ({
        id: v.source_id,
        title: v.title,
        cover: v.cover,
        desc: v.abstract,
        hot: undefined,
        url: v.url,
        mobileUrl: v.url,
      })),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
