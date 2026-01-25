import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from '../../utils/getTime';

/** 第三方 tianchenw 热搜 API 单条 */
interface KuaishouHotItem {
  index?: number;
  title?: string;
  hot?: number | string;
  url?: string;
}

/** 第三方 tianchenw 热搜 API 响应 */
interface KuaishouTianchenwResponse {
  code?: number;
  data?: KuaishouHotItem[];
  error?: string;
}

@Injectable()
@HotSource({
  name: 'kuaishou',
  title: '快手',
  type: '热榜',
  description: '快手热搜榜',
  link: 'https://www.kuaishou.com',
})
export class KuaishouSource implements HotListSource {
  private readonly logger = new Logger(KuaishouSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    try {
      const result = await this.fetchFromAPI(noCache ?? options.noCache);
      return {
        data: result.data ?? [],
        params: {
          type: { name: '热榜类型', type: {} },
        },
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`快手热搜获取失败: ${msg}`);
      return {
        data: [],
        params: { type: { name: '热榜类型', type: {} } },
        fromCache: false,
        updateTime: 0,
      };
    }
  }

  private async fetchFromAPI(noCache?: boolean): Promise<{
    data: HotListItem[];
    fromCache?: boolean;
    updateTime?: string;
  }> {
    try {
      return await this.fetchFromApollo(noCache);
    } catch (e) {
      this.logger.warn(
        `快手主源（Apollo）失败: ${e instanceof Error ? e.message : String(e)}，尝试备用源`,
      );
      return this.fetchFromTianchenw(noCache);
    }
  }

  /**
   * 主源：从快手首页 __APOLLO_STATE__ 解析 visionHotRank
   * 参考：https://github.com/cxyfreedom/website-hot-hub/blob/main/website_kuaishou.py
   */
  private async fetchFromApollo(noCache?: boolean): Promise<{
    data: HotListItem[];
    fromCache?: boolean;
    updateTime?: string;
  }> {
    const url = 'https://www.kuaishou.com/?isHome=1';
    const res = await this.httpService.get<string>({
      url,
      headers: {
        Referer: 'https://www.kuaishou.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      noCache,
      responseType: 'text',
    });

    const html = res.data;
    if (typeof html !== 'string' || !html) {
      throw new Error('快手首页返回非文本');
    }

    const re =
      /window\.__APOLLO_STATE__\s*=\s*([\s\S]*);\s*\(function\s*\(\s*\)/;
    const m = html.match(re);
    if (!m?.[1]) {
      throw new Error('快手首页未找到 __APOLLO_STATE__');
    }

    let apollo: Record<string, unknown>;
    try {
      apollo = JSON.parse(m[1]) as Record<string, unknown>;
    } catch {
      throw new Error('快手 __APOLLO_STATE__ 解析失败');
    }

    const client = apollo.defaultClient as Record<string, unknown> | undefined;
    if (!client || typeof client !== 'object') {
      throw new Error('快手 Apollo 缺少 defaultClient');
    }

    const visionKey = Object.keys(client).find((k) =>
      /visionHotRank|vision.*[Hh]ot.*[Rr]ank/.test(k),
    );
    const vision = visionKey
      ? (client[visionKey] as { items?: { id: string }[] } | undefined)
      : undefined;
    const items = vision?.items ?? [];

    if (items.length === 0) {
      throw new Error('快手 Apollo visionHotRank 为空');
    }

    const data: HotListItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as Record<string, unknown> | undefined;
      const ref =
        (typeof it?.__ref === 'string' ? it.__ref : null) ||
        (typeof it?.id === 'string' ? it.id : null);
      const node = ref
        ? (client[ref] as Record<string, unknown> | undefined)
        : undefined;
      const name = typeof node?.name === 'string' ? node.name : '';
      const poster = typeof node?.poster === 'string' ? node.poster : '';
      const cap = /clientCacheKey=([A-Za-z0-9]+)/.exec(poster);
      const vid = cap?.[1] ?? `apollo-${i}`;
      const link = `https://www.kuaishou.com/short-video/${vid}`;
      data.push({
        id: vid,
        title: name || link,
        timestamp: getTime(0) ?? 0,
        hot: 0,
        url: link,
        mobileUrl: link,
      });
    }

    this.logger.log(`快手 Apollo 解析成功，共 ${data.length} 条`);
    return {
      data,
      fromCache: res.fromCache,
      updateTime: res.updateTime,
    };
  }

  /**
   * 备用源：第三方 tianchenw（可能返回「非法请求」或空）
   */
  private async fetchFromTianchenw(noCache?: boolean): Promise<{
    data: HotListItem[];
    fromCache?: boolean;
    updateTime?: string;
  }> {
    const url = 'https://www.tianchenw.com/hot/kuaishou';
    const res = await this.httpService.get<KuaishouTianchenwResponse>({
      url,
      headers: {
        Referer: 'https://www.kuaishou.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      noCache,
    });

    const raw = res.data;
    if (raw?.error) {
      throw new Error(`第三方 API: ${raw.error}`);
    }
    if (!raw || typeof raw !== 'object') {
      throw new Error('快手备用 API 返回非对象');
    }

    const list = Array.isArray(raw.data) ? raw.data : [];
    if (list.length === 0) {
      throw new Error('快手备用 API 返回空列表');
    }

    const data: HotListItem[] = list.map((v, i) => {
      const id =
        (v.url && /(?:^|\/)short-video\/([^/?#]+)/.exec(v.url)?.[1]) ??
        `k-${v.index ?? i}`;
      const link =
        v.url?.replace(/\\\//g, '/') ||
        `https://www.kuaishou.com/short-video/${id}`;
      return {
        id,
        title: v.title ?? String(id),
        timestamp: getTime(0) ?? 0,
        hot: v.hot ?? 0,
        url: link,
        mobileUrl: link,
      };
    });

    this.logger.log(`快手备用源（tianchenw）成功，共 ${data.length} 条`);
    return {
      data,
      fromCache: res.fromCache,
      updateTime: res.updateTime,
    };
  }
}
