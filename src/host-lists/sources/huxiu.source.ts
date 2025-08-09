import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import * as cheerio from 'cheerio';

const typeMap = {
  '0': '最新',
  '1': '看世界',
  '2': '看重点',
  '3': '大公司',
  '4': '财经动态',
};

const urlMap = {
  '0': '',
  '1': 'recommended_feed.html',
  '2': 'category_feed/2.html',
  '3': 'category_feed/3.html',
  '4': 'category_feed/1.html',
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
    const type = options.type || '0';
    const url = `https://www.huxiu.com/moment/${urlMap[type]}`;
    console.log('url', url);
    const result = await this.httpService.get<string>({
      url,
      noCache,
    });

    const $ = cheerio.load(result.data);
    const list = $('.moment-items-wrap .moment-item-wrap')
      .map((i, el) => {
        const $el = $(el);
        const $momentItem = $el.find('.moment-item');

        // 获取用户信息
        const author = $momentItem.find('.user-info .username i').text().trim();

        // 获取内容文本 (包含title和desc，用<br>分隔)
        const contentHtml = $momentItem.find('.plain-text').html() || '';
        const contentText = $momentItem.find('.plain-text').text().trim();

        // 解析title和desc：HTML中用<br>分隔，文本中用换行符分隔
        let title = '';
        let desc = '';

        if (contentHtml) {
          // 使用HTML内容分割，处理<br>、<br/>、<br />等各种形式
          const parts = contentHtml.split(/<br\s*\/?>/i);
          title = parts[0] ? parts[0].trim().replace(/<[^>]*>/g, '') : '';
          desc = parts
            .slice(1)
            .join('')
            .trim()
            .replace(/<[^>]*>/g, '');
        } else if (contentText) {
          // 备选方案：使用纯文本分割
          const lines = contentText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line);
          title = lines[0] || '';
          desc = lines.slice(1).join(' ');
        }

        // 获取时间
        const timeText = $momentItem.find('.moment-time').text().trim();

        // 生成唯一ID (使用内容的hash或者索引)
        const id = `huxiu_${i}_${Date.now()}`;

        return {
          id,
          title,
          desc,
          author,
          timeText,
          originalContent: contentText,
        };
      })
      .get()
      .filter((item) => item.title || item.originalContent); // 过滤掉空内容

    return {
      data: list.map((v, index) => {
        return {
          id: v.id,
          title: v.title || v.originalContent,
          desc: v.desc || '',
          author: v.author || '虎嗅用户',
          timestamp: getTime(v.timeText),
          hot: index + 1, // 使用排序作为热度
          url: `https://www.huxiu.com/moment/`,
          mobileUrl: `https://m.huxiu.com/moment/`,
        };
      }),
      type: typeMap[type],
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
