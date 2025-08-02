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
import getWereadID from 'src/token/weread';

interface WereadApiResponse {
  books: RouterType['weread'][];
}

const typeMap: Record<string, string> = {
  rising: '飙升榜',
  hot_search: '热搜榜',
  newbook: '新书榜',
  general_novel_rising: '小说榜',
  all: '总榜',
};

@Injectable()
@HotSource({
  name: 'weread',
  title: '微信读书',
  type: '排行榜',
  link: 'https://weread.qq.com/',
})
export class WereadSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options.type || 'rising';
    const url = `https://weread.qq.com/web/bookListInCategory/${type}?rank=1`;
    const result = await this.httpService.get<WereadApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.67',
      },
    });
    const list = result?.data?.books || [];
    const data: HotListItem[] = list.map((v) => {
      const book = v.bookInfo;
      return {
        id: book.bookId,
        title: book.title,
        author: book.author,
        desc: book.intro,
        cover: book.cover.replace('s_', 't9_'),
        timestamp: getTime(book.publishTime),
        hot: v.readingCount,
        url: `https://weread.qq.com/web/bookDetail/${getWereadID(book.bookId)}`,
        mobileUrl: `https://weread.qq.com/web/bookDetail/${getWereadID(book.bookId)}`,
      };
    });
    return {
      data,
      type: typeMap[type] || '排行榜',
      params: {
        type: {
          name: '排行榜分区',
          type: typeMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
