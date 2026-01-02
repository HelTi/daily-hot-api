import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';

const typeMap: Record<string, string> = {
  realtime: '热搜',
  novel: '小说',
  movie: '电影',
  teleplay: '电视剧',
  car: '汽车',
};

const setDesc = (desc: string[] | string) => {
  return Array.isArray(desc) ? desc.join('\n') : desc;
};

@Injectable()
@HotSource({
  name: 'baidu',
  title: '百度',
  type: '热榜',
  link: 'https://top.baidu.com/board',
})
export class BaiduSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type ?? 'realtime';

    const url = `https://top.baidu.com/board?tab=${type}`;
    const result = await this.httpService.get<string>({
      url,
      noCache,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/1.0 Mobile/12F69 Safari/605.1.15',
      },
    });

    // 正则查找
    const pattern = /<!--s-data:(.*?)-->/s;
    const matchResult = result.data.match(pattern);
    if (!matchResult) throw new Error('Failed to parse baidu data');
    const parsedData = JSON.parse(matchResult[1]) as {
      cards: [{ content: RouterType['baidu'][] }];
    };
    const jsonObject: any = parsedData.cards[0].content;
    const hotList = jsonObject[0]?.content || [];
    // console.log('baidu hotList', hotList);
    const list = hotList.map((v: RouterType['baidu']) => ({
      id: v.index,
      title: v.word || v?.title,
      desc: setDesc(v.desc) || setDesc(v?.hotScore?.desc),
      cover: v.img || v.imgInfo?.src,
      author: v.show?.length ? v.show : '',
      timestamp: 0,
      hot: Number(v.hotScore?.value || 0),
      url:
        v.hotScore?.descUrl ||
        v.url ||
        `https://www.baidu.com/s?wd=${encodeURIComponent(v.word || v.query)}`,
      mobileUrl: v.rawUrl,
    }));
    return {
      data: list || [],
      type: typeMap[type] || '热搜',
      params: {
        type: {
          name: '热搜类别',
          type: typeMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
