import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { generateRandomId } from 'src/utils';

// Zhihu API types
interface ZhihuApiItem {
  target: {
    id: string;
    title: string;
    excerpt: string;
    image_url?: string;
    thumbnail?: string;
  };
  detail_text?: string;
  id?: string;
  card_id?: string;
  children?: Array<{
    thumbnail?: string;
  }>;
}

interface ZhihuApiResponse {
  data: {
    data: ZhihuApiItem[];
  };
}

@Injectable()
@HotSource({
  name: 'zhihu',
  title: '知乎',
  link: 'https://www.zhihu.com/hot',
})
export class ZhihuSource implements HotListSource {
  private readonly logger = new Logger(ZhihuSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    try {
      const result = await this.fetchFromAPI(noCache);
      return {
        data: result.data,
        params: {
          type: {
            name: '热搜类别',
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

      try {
        // 尝试使用备用方法
        const result = await this.fetchFromFallbackAPI(noCache);
        return {
          data: result.data,
          params: {
            type: {
              name: '热搜类别',
              type: {},
            },
          },
          fromCache: result.fromCache,
          updateTime: result.updateTime,
        };
      } catch (fallbackError: unknown) {
        const fallbackErrorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : 'Unknown error';

        this.logger.error(
          `Failed to get list from fallback API: ${fallbackErrorMessage}`,
        );
        return {
          data: [],
          params: {
            type: {
              name: '热搜类别',
              type: {},
            },
          },
          fromCache: false,
          updateTime: 0,
        };
      }
    }
  }

  private async fetchFromAPI(
    noCache: boolean,
  ): Promise<HotListGetListResponse> {
    // API 接口
    const url = 'https://api.zhihu.com/topstory/hot-list';

    // 添加请求头
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Connection: 'keep-alive',
      Referer: 'https://www.zhihu.com/hot',
      Origin: 'https://www.zhihu.com',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Ch-Ua':
        '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'X-Requested-With': 'XMLHttpRequest',
      'X-UDID': generateRandomId(32),
      'X-API-VERSION': '3.0.53',
    };

    const response = await this.httpService.get<ZhihuApiResponse>({
      url,
      headers,
      params: {
        limit: '50',
        reverse_order: '0',
        _t: Date.now().toString(),
      },
      noCache,
    });

    // console.log('response', response);

    // 解析API返回数据
    const apiData = (response as unknown as ZhihuApiResponse).data?.data || [];
    const list = apiData
      .map((v) => {
        const data = v.target;
        if (!data) return null;

        const q_id = v?.card_id?.split('_')?.[1] || data?.id || '';

        return {
          id: data.id || '',
          title: data.title || '',
          desc: data.excerpt || '',
          cover: v.children?.[0]?.thumbnail || '',
          timestamp: Date.now(),
          hot: v.detail_text
            ? parseFloat(v.detail_text.split(' ')[0]) * 10000
            : 0,
          url: `https://www.zhihu.com/question/${q_id}`,
          mobileUrl: `https://www.zhihu.com/question/${q_id}`,
        };
      })
      .filter(Boolean);

    return {
      data: list,
      fromCache: response.fromCache,
      updateTime: response.updateTime,
    };
  }

  private async fetchFromFallbackAPI(
    noCache: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total';

    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Connection: 'keep-alive',
      Referer: 'https://www.zhihu.com/hot',
      Origin: 'https://www.zhihu.com',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Ch-Ua':
        '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'X-Requested-With': 'XMLHttpRequest',
      'X-UDID': generateRandomId(32),
      'X-API-VERSION': '3.0.53',
    };

    const response = await this.httpService.get<ZhihuApiResponse>({
      url,
      headers,
      params: {
        limit: '50',
        desktop: 'true',
        _t: Date.now().toString(),
      },
      noCache,
    });

    // 解析API返回数据
    const apiData = (response as unknown as ZhihuApiResponse).data?.data || [];
    const list: HotListItem[] = apiData
      .map((v: ZhihuApiItem) => {
        const data = v.target;
        if (!data) return null;

        const q_id = v?.card_id?.split('_')?.[1] || data?.id || '';

        return {
          id: data.id || '',
          title: data.title || '',
          desc: data.excerpt || '',
          cover: v.children?.[0]?.thumbnail || '',
          timestamp: Date.now(),
          hot: v.detail_text
            ? parseFloat(v.detail_text.split(' ')[0]) * 10000
            : 0,
          url: `https://www.zhihu.com/question/${q_id}`,
          mobileUrl: `https://www.zhihu.com/question/${q_id}`,
        };
      })
      .filter(Boolean);

    return {
      data: list,
      fromCache: response.fromCache,
      updateTime: response.updateTime,
    };
  }
}
