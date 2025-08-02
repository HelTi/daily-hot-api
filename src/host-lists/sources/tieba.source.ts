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

interface TiebaApiResponse {
  data: {
    bang_topic: {
      topic_list: RouterType['tieba'][];
    };
  };
}

@Injectable()
@HotSource({
  name: 'tieba',
  title: '百度贴吧',
  type: '热议榜',
  link: 'https://tieba.baidu.com/hottopic/browse/topicList',
  description: '全球领先的中文社区',
})
export class TiebaSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://tieba.baidu.com/hottopic/browse/topicList';
    const result = await this.httpService.get<TiebaApiResponse>({
      url,
      noCache: noCache ?? options.noCache,
    });
    const list = result?.data?.data?.bang_topic?.topic_list || [];
    const data: HotListItem[] = list.map((v) => ({
      id: v.topic_id,
      title: v.topic_name,
      desc: v.topic_desc,
      cover: v.topic_pic,
      hot: v.discuss_num,
      timestamp: getTime(v.create_time),
      url: v.topic_url,
      mobileUrl: v.topic_url,
    }));
    return {
      data,
      type: '热议榜',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
