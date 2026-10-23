import { Injectable, Logger } from '@nestjs/common';
import { HttpClientService } from '../http/http.service';
import md5 from 'md5';

// Types for WBI authentication
interface EncodedKeys {
  img_key: string;
  sub_key: string;
}

interface WbiParams {
  [key: string]: string | number;
}

interface BilibiliNavResponse {
  data: {
    wbi_img?: {
      img_url: string;
      sub_url: string;
    };
  };
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly wbiNavRequest = {
    url: 'https://api.bilibili.com/x/web-interface/nav',
    headers: {
      Cookie: 'SESSDATA=xxxxxx',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
      Referer: 'https://www.bilibili.com/',
    },
    ttl: 1800,
  };

  // WBI 签名混淆参数表
  private readonly mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
  ];

  constructor(private readonly httpClientService: HttpClientService) {}

  /**
   * 对 imgKey 和 subKey 进行字符顺序打乱编码
   */
  private getMixinKey(orig: string): string {
    return this.mixinKeyEncTab
      .map((n) => orig[n])
      .join('')
      .slice(0, 32);
  }

  /**
   * 为请求参数进行 WBI 签名
   */
  private encWbi(params: WbiParams, img_key: string, sub_key: string): string {
    const mixin_key = this.getMixinKey(img_key + sub_key);
    const curr_time = Math.round(Date.now() / 1000);
    const chr_filter = /[!'()*]/g;

    // 添加 wts 字段
    params = { ...params, wts: curr_time };

    // 按照 key 重排参数
    const query = Object.keys(params)
      .sort()
      .map((key) => {
        // 过滤 value 中的 "!'()*" 字符
        const value = params[key].toString().replace(chr_filter, '');
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      })
      .join('&');

    // 计算 w_rid
    const wbi_sign = md5(query + mixin_key);
    return query + '&w_rid=' + wbi_sign;
  }

  /**
   * 获取最新的 img_key 和 sub_key
   */
  private async getWbiKeys(): Promise<EncodedKeys> {
    try {
      const response = await this.httpClientService.get<BilibiliNavResponse>({
        ...this.wbiNavRequest,
      });

      const img_url: string = response.data?.data?.wbi_img?.img_url ?? '';
      const sub_url: string = response.data?.data?.wbi_img?.sub_url ?? '';

      if (!img_url || !sub_url) {
        throw new Error('Failed to get WBI keys from Bilibili API');
      }

      return {
        img_key: img_url.slice(
          img_url.lastIndexOf('/') + 1,
          img_url.lastIndexOf('.'),
        ),
        sub_key: sub_url.slice(
          sub_url.lastIndexOf('/') + 1,
          sub_url.lastIndexOf('.'),
        ),
      };
    } catch (error) {
      this.logger.error('Failed to fetch WBI keys', error);
      throw new Error('Unable to retrieve Bilibili WBI keys');
    }
  }

  /**
   * 获取 Bilibili WBI 签名
   * @param customParams 自定义参数，默认使用测试参数
   * @returns WBI 签名字符串
   */
  async getBiliWbi(customParams?: WbiParams): Promise<string> {
    try {
      // nav 响应由 HTTP 客户端缓存；签名依赖参数和当前时间，必须每次重新计算。
      const web_keys = await this.getWbiKeys();

      // 使用自定义参数或默认测试参数
      const params = customParams || { foo: '114', bar: '514', baz: 1919810 };

      // 生成签名
      const query = this.encWbi(params, web_keys.img_key, web_keys.sub_key);

      return query;
    } catch (error) {
      this.logger.error('Failed to generate Bilibili WBI signature', error);
      throw error;
    }
  }

  /**
   * 清除 Bilibili WBI 缓存
   */
  async clearBiliWbiCache(): Promise<void> {
    await this.httpClientService.invalidateGet(this.wbiNavRequest);
  }

  /**
   * 生成带有 WBI 签名的完整 URL
   * @param baseUrl 基础 URL
   * @param params 请求参数
   * @returns 带签名的完整 URL
   */
  async generateWbiSignedUrl(
    baseUrl: string,
    params: WbiParams,
  ): Promise<string> {
    const signedQuery = await this.getBiliWbi(params);
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${signedQuery}`;
  }
  // 51cto token
  async get51ctoToken(): Promise<string> {
    const url = 'https://api-media.51cto.com/api/token-get';
    const response = await this.httpClientService.get<{
      data: {
        data: {
          token: string;
        };
      };
    }>({
      url,
    });
    const token = response.data?.data?.data?.token;
    return token;
  }
}
