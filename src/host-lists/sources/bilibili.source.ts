import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { TokenService } from '../../token/token.service';
import { GetListOptions, RouterType } from './source.types';

const typeMap: Record<string, string> = {
  '0': '全站',
  '1': '动画',
  '3': '音乐',
  '4': '游戏',
  '5': '娱乐',
  '188': '科技',
  '119': '鬼畜',
  '129': '舞蹈',
  '155': '时尚',
  '160': '生活',
  '168': '国创相关',
  '181': '影视',
};

interface BilibiliRankingResponse {
  data: {
    list: RouterType['bilibili'][];
  };
}

interface BilibiliLegacyResponse {
  data: {
    list: RouterType['bilibili'][];
  };
}

@Injectable()
@HotSource({
  name: 'bilibili',
  title: '哔哩哔哩',
  type: '热榜',
  link: 'https://www.bilibili.com/v/popular/rank/all',
})
export class BilibiliSource implements HotListSource {
  private readonly logger = new Logger(BilibiliSource.name);

  constructor(
    private readonly httpService: HttpClientService,
    private readonly tokenService: TokenService,
  ) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const type = options?.type ?? '0';

    try {
      // 首先尝试新接口
      const result = await this.getFromNewAPI(type, noCache);
      return {
        data: result.data || [],
        type: `热榜 · ${typeMap[type]}`,
        params: {
          type: {
            name: '排行榜分区',
            type: typeMap,
          },
        },
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (error) {
      this.logger.warn('New API failed, trying legacy API', error);

      // 新接口失败时使用备用接口
      const result = await this.getFromLegacyAPI(type, noCache);
      return {
        data: result.data || [],
        type: `热榜 · ${typeMap[type]}`,
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

  private async getFromNewAPI(type: string, noCache?: boolean) {
    try {
      // 获取WBI签名
      const wbiSignature = await this.tokenService.getBiliWbi({
        rid: type,
        type: 'all',
      });
      const url = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${type}&type=all&${wbiSignature}`;

      const result = await this.httpService.get<BilibiliRankingResponse>({
        url,
        noCache,
        headers: {
          Referer: 'https://www.bilibili.com/ranking/all',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Ch-Ua':
            '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (result.data?.data?.list?.length > 0) {
        this.logger.log('Using bilibili new API');
        const list = result.data.data.list;
        return {
          data: list.map((v: RouterType['bilibili']) => ({
            id: v.bvid,
            title: v.title,
            desc: v.desc || '该视频暂无简介',
            cover: v.pic?.replace(/http:/, 'https:'),
            author: v.owner?.name,
            timestamp: v.pubdate
              ? new Date(Number(v.pubdate) * 1000).getTime()
              : 0,
            hot: v.stat?.view || 0,
            url: v.short_link_v2 || `https://www.bilibili.com/video/${v.bvid}`,
            mobileUrl: `https://m.bilibili.com/video/${v.bvid}`,
          })),
          fromCache: result.fromCache,
          updateTime: result.updateTime,
        };
      } else {
        throw new Error('No data from new API');
      }
    } catch (error) {
      this.logger.error('Failed to get data from new API', error);
      throw error;
    }
  }

  private async getFromLegacyAPI(type: string, noCache?: boolean) {
    try {
      const url = `https://api.bilibili.com/x/web-interface/ranking?jsonp=jsonp&rid=${type}&type=all&callback=__jp0`;

      const result = await this.httpService.get<string>({
        url,
        noCache,
        headers: {
          Referer: 'https://www.bilibili.com/ranking/all',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
      });

      this.logger.log('Using bilibili legacy API');

      // 解析JSONP响应
      let jsonData: BilibiliLegacyResponse;
      if (typeof result.data === 'string') {
        const jsonMatch = result.data.match(/^__jp0\((.*)\)$/);
        if (jsonMatch) {
          jsonData = JSON.parse(jsonMatch[1]);
        } else {
          jsonData = JSON.parse(result.data);
        }
      } else {
        jsonData = result.data as BilibiliLegacyResponse;
      }

      const list = jsonData.data.list;
      return {
        data: list.map((v: RouterType['bilibili']) => ({
          id: v.bvid,
          title: v.title,
          desc: v.desc || '该视频暂无简介',
          cover: v.pic?.replace(/http:/, 'https:'),
          author: v.author,
          timestamp: 0,
          hot: v.video_review || 0,
          url: `https://www.bilibili.com/video/${v.bvid}`,
          mobileUrl: `https://m.bilibili.com/video/${v.bvid}`,
        })),
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (error) {
      this.logger.error('Failed to get data from legacy API', error);
      throw error;
    }
  }
}
