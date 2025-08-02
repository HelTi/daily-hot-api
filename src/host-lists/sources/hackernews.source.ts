import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';

// HackerNews API interfaces
interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  time?: number;
  by?: string;
  type?: string;
}

@Injectable()
@HotSource({
  name: 'hackernews',
  title: 'Hacker News',
  type: 'Popular',
  description: 'News about hacking and startups',
  link: 'https://news.ycombinator.com/',
})
export class HackerNewsSource implements HotListSource {
  private readonly logger = new Logger(HackerNewsSource.name);

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
            name: 'Top Stories',
            type: {},
          },
        },
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Failed to get HackerNews list: ${errorMessage}`);
      return {
        data: [],
        params: {
          type: {
            name: 'Top Stories',
            type: {},
          },
        },
        fromCache: false,
        updateTime: new Date(),
      };
    }
  }

  private async fetchFromAPI(
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    // 使用HackerNews官方API
    const topStoriesUrl =
      'https://hacker-news.firebaseio.com/v0/topstories.json';
    const itemBaseUrl = 'https://hacker-news.firebaseio.com/v0/item/';

    const headers = {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; HackerNewsBot/1.0)',
    };

    // 获取前30个热门故事ID
    const topStoriesResponse = await this.httpService.get<number[]>({
      url: topStoriesUrl,
      headers,
      noCache,
    });

    const topStoryIds = topStoriesResponse.data.slice(0, 30);

    // 并发获取故事详情
    const stories: HotListItem[] = [];

    // 分批处理，避免过多并发请求
    const batchSize = 10;
    for (let i = 0; i < topStoryIds.length; i += batchSize) {
      const batch = topStoryIds.slice(i, i + batchSize);

      const batchPromises = batch.map(async (id) => {
        try {
          const itemResponse = await this.httpService.get<HNItem>({
            url: `${itemBaseUrl}${id}.json`,
            headers,
            noCache,
          });

          const item = itemResponse.data;

          if (item && item.title && item.type === 'story') {
            const baseUrl = 'https://news.ycombinator.com';
            const finalUrl = item.url || `${baseUrl}/item?id=${item.id}`;

            const hotListItem: HotListItem = {
              id: item.id.toString(),
              title: item.title,
              hot: item.score || 0,
              timestamp: item.time ? item.time * 1000 : Date.now(),
              url: finalUrl,
              mobileUrl: finalUrl,
              author: item.by,
            };
            return hotListItem;
          }
          return null;
        } catch (error) {
          this.logger.warn(`Failed to fetch item ${id}: ${error}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      stories.push(
        ...batchResults.filter((item): item is HotListItem => item !== null),
      );
    }

    return {
      data: stories,
      fromCache: topStoriesResponse.fromCache,
      updateTime: topStoriesResponse.updateTime,
    };
  }
}
