import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import * as cheerio from 'cheerio';
import { Logger } from '@nestjs/common';

@Injectable()
@HotSource({
  name: 'weibo',
  title: '微博',
  type: '热搜榜',
  link: 'https://s.weibo.com/top/summary/',
  description: '实时热点，每分钟更新一次',
})
export class WeiboSource implements HotListSource {
  private readonly logger = new Logger(WeiboSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  /**
   * 生成微博所需的Cookie
   */
  private generateWeiboCookies(): string {
    // 生成SUB Cookie (用户标识)
    const sub = this.generateSUB();
    // 生成SUBP Cookie (子域名标识)
    const subp = this.generateSUBP();
    // 生成SRF Cookie (反爬虫标识)
    const srf = this.generateSRF();

    return `SUB=${sub}; SUBP=${subp}; SRF=${srf}`;
  }

  /**
   * 生成SUB Cookie
   * SUB格式: 随机字符串 + 时间戳 + 随机字符串
   */
  private generateSUB(): string {
    const timestamp = Date.now();
    const random1 = Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15);
    return `${random1}${timestamp}${random2}`;
  }

  /**
   * 生成SUBP Cookie
   * SUBP格式: 0033WrSXqPxfM725Ws9jqgMF55529P9D9W5... (固定格式)
   */
  private generateSUBP(): string {
    return '0033WrSXqPxfM725Ws9jqgMF55529P9D9W5...';
  }

  /**
   * 生成SRF Cookie
   * SRF格式: 随机字符串
   */
  private generateSRF(): string {
    return Math.random().toString(36).substring(2, 20);
  }

  /**
   * 获取微博临时Cookie
   */
  private async getWeiboCookies(): Promise<string> {
    try {
      // 先访问微博首页获取初始Cookie
      await this.httpService.get<string>({
        url: 'https://weibo.com',
        responseType: 'text',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      // 生成必要的Cookie
      const generatedCookies = this.generateWeiboCookies();

      return generatedCookies;
    } catch (error) {
      this.logger.error(`获取微博Cookie失败: ${error}`);
      return this.generateWeiboCookies();
    }
  }

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = 'https://s.weibo.com/top/summary';

    // 获取Cookie
    const cookies = await this.getWeiboCookies();

    const htmlResp = await this.httpService.get<string>({
      url,
      noCache: noCache ?? options.noCache,
      ttl: 60,
      responseType: 'text',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://s.weibo.com/top/summary',
        Cookie: cookies,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    const rawHtml = htmlResp.data;
    console.log('rawHtml', rawHtml);
    const $ = cheerio.load(rawHtml);
    const list: HotListItem[] = [];

    // 尝试多种选择器来解析热搜榜
    const selectors = [
      '#pl_top_realtimehot table tbody tr',
      '.data tbody tr',
      '.list_a li',
      '.hot_list li',
    ];

    let found = false;
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        this.logger.log(
          `使用选择器: ${selector}, 找到 ${elements.length} 个元素`,
        );
        found = true;

        elements.each((i, el) => {
          // 跳过表头
          if (i === 0) return;

          const tds = $(el).find('td');
          if (tds.length === 0) return;

          const rank = $(tds[0]).text().trim();
          const title = $(tds[1]).find('a').text().trim();
          const href = $(tds[1]).find('a').attr('href');
          const url = href ? 'https://s.weibo.com' + href : '';
          const hot =
            parseInt($(tds[1]).find('span').text().replace(/[^\d]/g, '')) ||
            undefined;
          const desc = $(tds[1]).find('p').text().trim();
          const icon = $(tds[1]).find('img').attr('alt') || '';

          if (title) {
            list.push({
              id: rank || title,
              title,
              desc: desc || icon || title,
              author: icon,
              timestamp: Date.now(),
              hot,
              url,
              mobileUrl: url,
            });
          }
        });
        break;
      }
    }

    if (!found) {
      this.logger.warn('未找到热搜榜数据，可能需要更新选择器或Cookie');
    }

    return {
      data: list,
      type: '热搜榜',
      description: '实时热点，每分钟更新一次',
      fromCache: htmlResp.fromCache,
      updateTime: htmlResp.updateTime,
    };
  }
}
