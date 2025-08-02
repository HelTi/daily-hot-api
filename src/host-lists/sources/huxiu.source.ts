import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

const titleProcessing = (text: string) => {
  const paragraphs = text.split('<br><br>');
  const title = paragraphs.shift()?.replace(/。$/, '');
  const intro = paragraphs.join('<br><br>');
  return { title, intro };
};

@Injectable()
@HotSource({
  name: 'huxiu',
  title: '虎嗅',
  type: '24小时',
  link: 'https://www.huxiu.com/moment/',
})
export class HuxiuSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = `https://www.huxiu.com/moment/`;
    const result = await this.httpService.get<string>({
      url,
      noCache,
    });

    // 正则查找
    const pattern =
      /<script>[\s\S]*?window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});[\s\S]*?<\/script>/;
    const matchResult = result.data.match(pattern);
    const list = JSON.parse(matchResult[1]).moment.momentList.moment_list
      .datalist;

    return {
      data: list.map((v: RouterType['huxiu']) => {
        return {
          id: v.object_id,
          title: titleProcessing(v.content).title,
          desc: titleProcessing(v.content).intro,
          author: v.user_info.username,
          timestamp: getTime(v.publish_time),
          hot: undefined,
          url: v.url || `https://www.huxiu.com/moment/${v.object_id}.html`,
          mobileUrl: v.url || `https://m.huxiu.com/moment/${v.object_id}.html`,
        };
      }),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
