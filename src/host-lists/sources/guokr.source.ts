import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from '../../utils/getTime';

// Guokr API types
interface GuokrApiItem {
  id: number;
  title: string;
  summary: string;
  author: {
    nickname: string;
  };
  date_modified: string;
  small_image: string;
}

@Injectable()
@HotSource({
  name: 'guokr',
  title: '果壳',
  type: '热门文章',
  description: '科技有意思',
  link: 'https://www.guokr.com/',
})
export class GuokrSource implements HotListSource {
  private readonly logger = new Logger(GuokrSource.name);

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
            name: '热门文章',
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
            name: '热门文章',
            type: {},
          },
        },
        fromCache: false,
        updateTime: new Date(),
      };
    }
  }

  private async fetchFromAPI(
    noCache: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://www.guokr.com/beta/proxy/science_api/articles';

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    };

    const response = await this.httpService.get<GuokrApiItem[]>({
      url,
      headers,
      params: {
        limit: '30',
      },
      noCache,
    });

    const apiData = response.data || [];
    const list: HotListItem[] = apiData.map((v: GuokrApiItem) => ({
      id: v.id,
      title: v.title,
      desc: v.summary,
      cover: v.small_image,
      author: v.author?.nickname,
      hot: undefined,
      timestamp: getTime(v.date_modified),
      url: `https://www.guokr.com/article/${v.id}`,
      mobileUrl: `https://m.guokr.com/article/${v.id}`,
    }));

    return {
      data: list,
      fromCache: response.fromCache,
      updateTime: response.updateTime,
    };
  }
}
