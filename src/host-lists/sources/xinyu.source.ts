import { Injectable } from '@nestjs/common';
import { load } from 'cheerio';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import { getTime } from 'src/utils/getTime';
import { headers } from 'src/utils/headers';

const SITE_URL = 'https://www.eet-china.com';
const LIST_URL = `${SITE_URL}/mp`;
const DEFAULT_TYPE_MAP = {
  newest: '最新',
  c1: '半导体',
  c2: '通信网络',
  c3: '消费电子/手机',
  c4: '汽车电子',
  c5: '物联网',
  c6: '工控',
  c7: '硬件设计',
  c8: '嵌入式/FPGA',
  c9: '电源/能源',
  c10: '测试测量',
  c11: '人工智能/机器人',
  c12: '科技前沿',
  c13: '供应链',
  c14: '工程师职场',
  c15: '芯片制造封装',
};

const getUrl = (href?: string) => {
  if (!href) return '';

  try {
    return new URL(href, SITE_URL).toString();
  } catch {
    return href;
  }
};

const getId = (url: string) => {
  const match = url.match(/\/mp\/a(\d+)\.html/);
  return match?.[1] || url.match(/([^/]+)$/)?.[1] || url;
};

const getBackgroundImageUrl = (style?: string) => {
  if (!style) return undefined;

  return style.match(/background-image:\s*url\((['"]?)(.*?)\1\)/)?.[2];
};

const getTypeKeyFromUrl = (href?: string) => {
  const url = getUrl(href);
  const match = url.match(/\/mp\/(c\d+)\/?$/);

  return match?.[1] || 'newest';
};

const getListUrl = (type?: string) => {
  const selectedType =
    Object.entries(DEFAULT_TYPE_MAP).find(([, title]) => title === type)?.[0] ||
    type ||
    'newest';

  return selectedType === 'newest'
    ? LIST_URL
    : `${LIST_URL}/${selectedType.replace(/^\//, '')}`;
};

@Injectable()
@HotSource({
  name: 'xinyu',
  title: '芯语',
  type: '最新',
  link: LIST_URL,
})
export class XinyuSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const url = getListUrl(options.type);
    const result = await this.httpService.get<string>({
      url,
      noCache: noCache ?? options.noCache,
      headers: {
        ...headers,
        Referer: SITE_URL,
      },
    });

    const $ = load(result.data);
    const typeMap = $('.channel-list-seat a')
      .toArray()
      .reduce<Record<string, string>>((map, item) => {
        const title = $(item).text().replace(/\s+/g, ' ').trim();
        const type = getTypeKeyFromUrl($(item).attr('href'));

        if (title) {
          map[type] = title;
        }

        return map;
      }, {});
    const data = $('.new-list li')
      .toArray()
      .map((item) => {
        const dom = $(item);
        const titleDom = dom.find('.new-title a').first();
        const href = titleDom.attr('href');
        const url = getUrl(href);
        const authorDom = dom.find('.new-relevant .write').first().clone();
        authorDom.find('strong,img').remove();
        const relevantSpans = dom.find('.new-relevant span').toArray();
        const dateText =
          relevantSpans
            .map((span) => $(span).text().trim())
            .find((text) => /^\d{4}-\d{2}-\d{2}/.test(text)) || '';
        const viewText =
          relevantSpans
            .map((span) => $(span).text().trim())
            .find((text) => text.includes('浏览')) || '';

        return {
          id: getId(url),
          title: titleDom.text().replace(/\s+/g, ' ').trim(),
          cover: getBackgroundImageUrl(dom.find('.thepic').attr('style')),
          author: authorDom.text().replace(/\s+/g, ' ').trim() || undefined,
          timestamp: dateText ? getTime(dateText) : undefined,
          hot: Number(viewText.replace(/\D/g, '')) || undefined,
          url,
          mobileUrl: url,
        };
      })
      .filter((item) => item.title && item.url);

    return {
      data,
      type: DEFAULT_TYPE_MAP[options.type] || options.type || '最新',
      params: {
        type: {
          name: '类目',
          type: Object.keys(typeMap).length ? typeMap : DEFAULT_TYPE_MAP,
        },
      },
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
