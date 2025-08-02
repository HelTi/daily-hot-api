import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from '../../utils/getTime';

interface DouyinApiResponse {
  data: {
    word_list: RouterType['douyin'][];
  };
}

@Injectable()
@HotSource({
  name: 'douyin',
  title: '抖音',
  type: '热榜',
  description: '实时上升热点',
  link: 'https://www.douyin.com',
})
export class DouyinSource implements HotListSource {
  private readonly logger = new Logger(DouyinSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    try {
      const result = await this.fetchFromAPI(noCache);
      return {
        data: result.data || [],
        params: {
          type: {
            name: '热榜类型',
            type: {},
          },
        },
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Failed to get list from API: ${errorMessage}`);
      return {
        data: [],
        params: {
          type: {
            name: '热榜类型',
            type: {},
          },
        },
        fromCache: false,
        updateTime: 0,
      };
    }
  }

  /**
   * 获取抖音临时 Cookie
   */
  private async getDyCookies(): Promise<string | undefined> {
    try {
      const cookisUrl =
        'https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383';
      const response = await fetch(cookisUrl);
      const text = response.headers?.get('set-cookie');
      const pattern = /passport_csrf_token=(.*); Path/s;
      const matchResult = text.match(pattern);
      const cookieData = matchResult?.[1];
      return cookieData;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`获取抖音 Cookie 出错: ${errorMessage}`);
      return undefined;
    }
  }

  private async fetchFromAPI(
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url =
      'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1';

    const cookie = await this.getDyCookies();
    const headers: Record<string, string> = {};

    if (cookie) {
      headers.Cookie = `passport_csrf_token=${cookie}`;
    }

    const response = await this.httpService.get<DouyinApiResponse>({
      url,
      headers,
      noCache,
    });
    console.log('response11', response);

    const apiData = response.data?.data?.word_list || [];

    return {
      data: apiData.map((item) => ({
        id: item.sentence_id,
        title: item.word,
        timestamp: getTime(item.event_time),
        hot: item.hot_value,
        url: `https://www.douyin.com/hot/${item.sentence_id}`,
        mobileUrl: `https://www.douyin.com/hot/${item.sentence_id}`,
      })),
      fromCache: response.fromCache,
      updateTime: response.updateTime,
    };
  }
}
