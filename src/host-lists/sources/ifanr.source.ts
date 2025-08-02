import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from 'src/utils/getTime';

interface IfanrApiResponse {
  objects: RouterType['ifanr'][];
}

@Injectable()
@HotSource({
  name: 'ifanr',
  title: '爱范儿',
  type: '快讯',
  description: '15秒了解全球新鲜事',
  link: 'https://www.ifanr.com/digest/',
})
export class IfanrSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://sso.ifanr.com/api/v5/wp/buzz/?limit=20&offset=0';
    const result = await this.httpService.get<IfanrApiResponse>({
      url,
      noCache,
    });

    const list = result.data.objects || [];

    return {
      data: list.map((v) => {
        return {
          id: v.id,
          title: v.post_title,
          desc: v.post_content,
          timestamp: getTime(v.created_at),
          hot: v.like_count || v.comment_count,
          url: v.buzz_original_url || `https://www.ifanr.com/${v.post_id}`,
          mobileUrl:
            v.buzz_original_url || `https://www.ifanr.com/digest/${v.post_id}`,
        };
      }),
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
