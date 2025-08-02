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

interface WeatheralarmApiResponse {
  data: { page: { list: RouterType['weatheralarm'][] } };
}

@Injectable()
@HotSource({
  name: 'weatheralarm',
  title: '中央气象台',
  type: '气象预警',
  link: 'http://nmc.cn/publish/alarm.html',
})
export class WeatheralarmSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const province = options.province || '';
    const url = `http://www.nmc.cn/rest/findAlarm?pageNo=1&pageSize=20&signaltype=&signallevel=&province=${encodeURIComponent(province)}`;
    const result = await this.httpService.get<WeatheralarmApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
    });
    console.log(result);
    const list = result?.data?.data?.page?.list || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.alertid,
      title: v.title,
      desc: v.issuetime + ' ' + v.title,
      cover: v.pic,
      timestamp: getTime(v.issuetime),
      hot: undefined,
      url: `http://nmc.cn${v.url}`,
      mobileUrl: `http://nmc.cn${v.url}`,
    }));
    return {
      data,
      type: `${province || '全国'}气象预警`,
      params: {
        type: {
          name: '',
          type: {},
        },
        province: {
          name: '预警区域',
          type: {},
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
