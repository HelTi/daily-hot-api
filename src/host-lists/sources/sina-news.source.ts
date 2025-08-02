import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime, getCurrentDateTime } from 'src/utils/getTime';

const listType = {
  '1': { name: '总排行', www: 'news', params: 'www_www_all_suda_suda' },
  '2': { name: '视频排行', www: 'news', params: 'video_news_all_by_vv' },
  '3': { name: '图片排行', www: 'news', params: 'total_slide_suda' },
  '4': { name: '国内新闻', www: 'news', params: 'news_china_suda' },
  '5': { name: '国际新闻', www: 'news', params: 'news_world_suda' },
  '6': { name: '社会新闻', www: 'news', params: 'news_society_suda' },
  '7': { name: '体育新闻', www: 'sports', params: 'sports_suda' },
  '8': { name: '财经新闻', www: 'finance', params: 'finance_0_suda' },
  '9': { name: '娱乐新闻', www: 'ent', params: 'ent_suda' },
  '10': { name: '科技新闻', www: 'tech', params: 'tech_news_suda' },
  '11': { name: '军事新闻', www: 'news', params: 'news_mil_suda' },
};

function parseData(data: string): any {
  const prefix = 'var data = ';
  if (!data.startsWith(prefix))
    throw new Error('Input data does not start with the expected prefix');
  let jsonString = data.slice(prefix.length).trim();
  if (jsonString.endsWith(';')) {
    jsonString = jsonString.slice(0, -1).trim();
  } else {
    throw new Error('Input data does not end with a semicolon');
  }
  if (jsonString.startsWith('{') && jsonString.endsWith('}')) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error('Failed to parse JSON: ' + error);
    }
  } else {
    throw new Error('Invalid JSON format');
  }
}

@Injectable()
@HotSource({
  name: 'sina-news',
  title: '新浪新闻',
  type: '榜单',
  link: 'https://sinanews.sina.cn/',
})
export class SinaNewsSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type || '1';
    const { params, www } = listType[type as keyof typeof listType];
    const { year, month, day } = getCurrentDateTime(true);
    const url = `https://top.${www}.sina.com.cn/ws/GetTopDataList.php?top_type=day&top_cat=${params}&top_time=${year + month + day}&top_show_num=50`;
    const result = await this.httpService.get<string>({ url, noCache });
    const list = parseData(result.data).data;
    const typeMap = Object.fromEntries(
      Object.entries(listType).map(([key, value]) => [key, value.name]),
    );
    return {
      data: list.map((v: RouterType['sina-news']) => ({
        id: v.id,
        title: v.title,
        author: v.media || undefined,
        hot: parseFloat(v.top_num.replace(/,/g, '')),
        timestamp: getTime(v.create_date + ' ' + v.create_time),
        url: v.url,
        mobileUrl: v.url,
      })),
      type: listType[type as keyof typeof listType].name,
      params: {
        type: {
          name: '榜单分类',
          type: typeMap,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
