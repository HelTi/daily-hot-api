import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface GeekparkApiResponse {
  homepage_posts: RouterType['geekpark'][];
}

@Injectable()
@HotSource({
  name: 'geekpark',
  title: '极客公园',
  type: '热门文章',
  description:
    '极客公园聚焦互联网领域，跟踪新鲜的科技新闻动态，关注极具创新精神的科技产品。',
  link: 'https://www.geekpark.net/',
})
export class GeekparkSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://mainssl.geekpark.net/api/v2';

    const result = await this.httpService.get<GeekparkApiResponse>({
      url,
      noCache,
    });
    console.log(result);
    const list = result.data?.homepage_posts || [];
    return {
      data: list.map((v) => {
        const post = v.post;
        return {
          id: post.id,

          title: post.title,
          desc: post.abstract,
          cover: post.cover_url,
          author: post?.authors?.[0]?.nickname,
          hot: post.views,
          timestamp: getTime(post.published_timestamp),
          url: `https://www.geekpark.net/news/${post.id}`,
          mobileUrl: `https://www.geekpark.net/news/${post.id}`,
        };
      }),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
