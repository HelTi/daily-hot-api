import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { load } from 'cheerio';

@Injectable()
@HotSource({
  name: 'producthunt',
  title: 'Product Hunt',
  type: 'Today',
  description: 'The best new products, every day',
  link: 'https://www.producthunt.com/',
})
export class ProductHuntSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const baseUrl = 'https://www.producthunt.com';
    const result = await this.httpService.get<string>({
      url: baseUrl,
      noCache,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    try {
      const $ = load(result.data);
      const stories: RouterType['producthunt'][] = [];

      $('[data-test=homepage-section-0] [data-test^=post-item]').each(
        (_, el) => {
          const a = $(el).find('a').first();
          const path = a.attr('href');
          const title = $(el).find('a[data-test^=post-name]').text().trim();
          const id = $(el).attr('data-test')?.replace('post-item-', '');
          const vote = $(el).find('[data-test=vote-button]').text().trim();

          if (path && id && title) {
            stories.push({
              id,
              title,
              hot: parseInt(vote) || undefined,
              timestamp: undefined,
              url: `${baseUrl}${path}`,
              mobileUrl: `${baseUrl}${path}`,
            });
          }
        },
      );

      return {
        data: stories,
        type: 'Today',
        description: 'The best new products, every day',
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (error) {
      throw new Error(`Failed to parse Product Hunt HTML: ${error}`);
    }
  }
}
