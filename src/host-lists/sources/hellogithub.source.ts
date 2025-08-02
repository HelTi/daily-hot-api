import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from '../../utils/getTime';

const typeMap: Record<string, string> = {
  featured: '精选',
  all: '全部',
};

// HelloGitHub API types
interface HelloGitHubApiItem {
  item_id: string;
  title: string;
  summary: string;
  author: string;
  clicks_total: number;
  updated_at: string;
}

interface HelloGitHubApiResponse {
  data: HelloGitHubApiItem[];
}

@Injectable()
@HotSource({
  name: 'hellogithub',
  title: 'HelloGitHub',
  type: '热门仓库',
  description: '分享 GitHub 上有趣、入门级的开源项目',
  link: 'https://hellogithub.com/',
})
export class HelloGitHubSource implements HotListSource {
  private readonly logger = new Logger(HelloGitHubSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const sort = options?.type || 'featured';

    try {
      const data = await this.fetchFromAPI(sort, noCache);

      return {
        data: data.data,
        params: {
          type: {
            name: '排行榜分区',
            type: typeMap,
          },
        },
        type: typeMap[sort],
        fromCache: data.fromCache,
        updateTime: data.updateTime,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch HelloGitHub hot list: ${error.message}`,
      );
      return {
        data: [],
        fromCache: false,
        updateTime: new Date(),
      };
      throw error;
    }
  }

  private async fetchFromAPI(
    sort: string,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = `https://abroad.hellogithub.com/v1/?sort_by=${sort}&tid=&page=1`;

    try {
      const response = await this.httpService.get<HelloGitHubApiResponse>({
        url,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        noCache,
      });

      const list = response.data.data;

      return {
        data: list.map((item: HelloGitHubApiItem) => ({
          id: item.item_id,
          title: item.title,
          desc: item.summary,
          author: item.author,
          timestamp: getTime(item.updated_at),
          hot: item.clicks_total,
          url: `https://hellogithub.com/repository/${item.item_id}`,
          mobileUrl: `https://hellogithub.com/repository/${item.item_id}`,
        })),
        fromCache: response.fromCache,
        updateTime: response.updateTime,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch data from HelloGitHub API: ${error.message}`,
      );
      throw error;
    }
  }
}
