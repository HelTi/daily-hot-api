import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';

interface Topic {
  id: number;
  title: string;
  excerpt: string;
  last_poster_username: string;
  created_at: string;
  views: number;
  like_count: number;
}

interface LinuxdoApiResponse {
  topic_list: {
    topics: Topic[];
  };
}

@Injectable()
@HotSource({
  name: 'linuxdo',
  title: 'Linux.do',
  type: '热门文章',
  description: 'Linux 技术社区热搜',
  link: 'https://linux.do/hot',
})
export class LinuxdoSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://linux.do/top.json?period=weekly';

    const result = await this.httpService.get<LinuxdoApiResponse>({
      url,
      noCache,
      headers: {
        Accept: 'application/json',
      },
    });

    const topics = result.data.topic_list.topics;
    const list = topics.map((topic) => {
      return {
        id: topic.id,
        title: topic.title,
        desc: topic.excerpt,
        author: topic.last_poster_username,
        timestamp: getTime(topic.created_at),
        url: `https://linux.do/t/${topic.id}`,
        mobileUrl: `https://linux.do/t/${topic.id}`,
        hot: topic.views || topic.like_count,
      };
    });

    return {
      data: list,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
