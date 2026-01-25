import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions, RouterType } from './source.types';
import { getTime } from '../../utils/getTime';

interface DouyinApiResponse {
  data?: {
    word_list?: RouterType['douyin'][];
  };
  word_list?: RouterType['douyin'][];
}

/** 第三方备用 API 返回格式 */
interface DouyinFallbackItem {
  index?: number;
  title?: string;
  hot?: number;
  url?: string;
}

interface DouyinFallbackResponse {
  code?: number;
  data?: DouyinFallbackItem[];
}

@Injectable()
@HotSource({
  name: 'douyin',
  title: '抖音',
  type: '热榜',
  description: '实时上升热点',
  link: 'https://www.douyin.com',
})
export class DouyinSource implements HotListSource {
  private readonly logger = new Logger(DouyinSource.name);

  constructor(
    private readonly httpService: HttpClientService,
    private readonly axios: HttpService,
  ) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    try {
      const result = await this.fetchFromAPI(noCache);
      return {
        data: result.data || [],
        params: {
          type: {
            name: '热榜类型',
            type: {},
          },
        },
        fromCache: result.fromCache,
        updateTime: result.updateTime,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Failed to get list: ${errorMessage}`);
      return {
        data: [],
        params: {
          type: {
            name: '热榜类型',
            type: {},
          },
        },
        fromCache: false,
        updateTime: 0,
      };
    }
  }

  /**
   * 生成随机 msToken（抖音 Web 常用参数）
   */
  private genMsToken(): string {
    const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz23456789';
    return Array.from(
      { length: 32 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  }

  /**
   * 获取抖音 Cookie（使用 axios 以正确读取 Set-Cookie）
   * 先访问 /hot 页再取 login_guiding_strategy，提高成功率
   */
  private async getDyCookies(): Promise<string> {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const baseHeaders = {
      'User-Agent': ua,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    const extractCsrf = (
      setCookies: string | string[] | undefined,
    ): string | null => {
      const list = Array.isArray(setCookies)
        ? setCookies
        : setCookies
          ? [setCookies]
          : [];
      for (const s of list) {
        const m = s.match(/passport_csrf_token=([^;\s]+)/);
        if (m?.[1]) return m[1];
      }
      return null;
    };

    try {
      // 1) 先访问热点页，模拟正常用户，获取部分 Cookie
      await firstValueFrom(
        this.axios.get('https://www.douyin.com/hot', {
          headers: { ...baseHeaders, Referer: 'https://www.douyin.com/' },
          timeout: 8000,
          validateStatus: () => true,
          maxRedirects: 3,
        }),
      );
    } catch {
      // 忽略，继续用 strategy 拿 token
    }

    try {
      const res = await firstValueFrom(
        this.axios.get(
          'https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383',
          {
            headers: { ...baseHeaders, Referer: 'https://www.douyin.com/' },
            timeout: 8000,
            validateStatus: () => true,
          },
        ),
      );

      const setCookie = res.headers?.['set-cookie'];
      const csrf = extractCsrf(setCookie);
      if (csrf) {
        return `passport_csrf_token=${csrf}`;
      }
    } catch (e) {
      this.logger.warn(
        `获取抖音 Cookie 出错: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return '';
  }

  private async fetchFromAPI(noCache?: boolean): Promise<{
    data: HotListItem[];
    fromCache?: boolean;
    updateTime?: string;
  }> {
    const msToken = this.genMsToken();
    const url =
      'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1&msToken=' +
      encodeURIComponent(msToken);

    const cookie = await this.getDyCookies();
    const headers: Record<string, string> = {
      Referer: 'https://www.douyin.com/hot',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    if (cookie) headers.Cookie = cookie;

    let response: Awaited<ReturnType<HttpClientService['get']>>;
    try {
      response = await this.httpService.get<DouyinApiResponse>({
        url,
        headers,
        noCache,
      });
    } catch (e) {
      this.logger.warn(
        `抖音主 API 失败，尝试备用源: ${e instanceof Error ? e.message : String(e)}`,
      );
      return this.fetchFromFallback(noCache);
    }

    const body = response.data;
    if (!body || typeof body !== 'object') {
      this.logger.warn('抖音主 API 返回非对象，尝试备用源');
      return this.fetchFromFallback(noCache);
    }

    const b = body as DouyinApiResponse;
    const raw = b.data?.word_list ?? b.word_list;
    const list = Array.isArray(raw) ? raw : [];

    if (list.length === 0) {
      this.logger.warn('抖音主 API 返回空列表，尝试备用源');
      return this.fetchFromFallback(noCache);
    }

    const data: HotListItem[] = list.map((item, i) => ({
      id: item.sentence_id ?? `item-${i}`,
      title: item.word ?? String(item.sentence_id ?? i),
      timestamp: getTime(item.event_time ?? 0) ?? 0,
      hot: item.hot_value ?? 0,
      url: `https://www.douyin.com/hot/${item.sentence_id ?? i}`,
      mobileUrl: `https://www.douyin.com/hot/${item.sentence_id ?? i}`,
    }));

    return {
      data,
      fromCache: response.fromCache,
      updateTime: response.updateTime,
    };
  }

  /**
   * 备用源：第三方聚合 API
   */
  private async fetchFromFallback(noCache?: boolean): Promise<{
    data: HotListItem[];
    fromCache?: boolean;
    updateTime?: string;
  }> {
    const fallbackUrl = 'https://www.tianchenw.com/hot/douyin';
    try {
      const res = await this.httpService.get<DouyinFallbackResponse>({
        url: fallbackUrl,
        headers: {
          Referer: 'https://www.douyin.com/',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        noCache,
      });

      const raw = res.data as unknown;
      if (!raw || typeof raw !== 'object') {
        throw new Error('备用 API 返回非对象');
      }

      const arr = (raw as DouyinFallbackResponse).data;
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('备用 API 返回空列表');
      }

      const data: HotListItem[] = arr.map((v, i) => {
        const id =
          (v.url && /\/hot\/(\d+)/.exec(v.url)?.[1]) ??
          `fallback-${v.index ?? i}`;
        const link = v.url || `https://www.douyin.com/hot/${id}`;
        return {
          id,
          title: v.title ?? String(id),
          timestamp: getTime(0) ?? 0,
          hot: v.hot ?? 0,
          url: link,
          mobileUrl: link,
        };
      });

      this.logger.log(`抖音使用备用源成功，共 ${data.length} 条`);
      return {
        data,
        fromCache: res.fromCache,
        updateTime: res.updateTime,
      };
    } catch (e) {
      this.logger.warn(
        `抖音备用源失败: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }
  }
}
