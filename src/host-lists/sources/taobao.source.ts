import { Injectable } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';

const TAOBAO_HOME_URL = 'https://www.taobao.com/';

interface TaobaoHomeItem {
  itemId: string;
  shortTitle: string;
  clickUrl: string;
  price?: string;
  benefit?: string;
  itemWhiteImg?: string;
  cardTitle?: string;
}

interface TaobaoItemsResult {
  items: TaobaoHomeItem[];
  fromCache: boolean;
  updateTime: string;
}

const toTaobaoMobileSearchUrl = (keyword: string) =>
  `https://main.m.taobao.com/search/index.html?q=${encodeURIComponent(
    keyword,
  )}&sort=sale-desc`;

const toStringValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

const normalizeUrl = (url: string) => {
  if (url.startsWith('//')) return `https:${url}`;
  return url;
};

const extractStaticConfig = (html: string): unknown => {
  const match = /window\.staticConfig\s*=/.exec(html);
  const start = match?.index ?? -1;

  if (start === -1) {
    throw new Error('Failed to find taobao static config');
  }

  const braceStart = html.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = braceStart; i < html.length; i += 1) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(braceStart, i + 1));
      }
    }
  }

  throw new Error('Failed to parse taobao static config');
};

const collectItems = (
  value: unknown,
  cardTitle = '',
  items: TaobaoHomeItem[] = [],
): TaobaoHomeItem[] => {
  if (!value || typeof value !== 'object') return items;

  if (Array.isArray(value)) {
    value.forEach((item) => collectItems(item, cardTitle, items));
    return items;
  }

  const objectValue = value as Record<string, unknown>;
  const nextCardTitle =
    typeof objectValue.cardTitle === 'string'
      ? objectValue.cardTitle
      : cardTitle;
  const itemId = toStringValue(objectValue.itemId);
  const shortTitle =
    typeof objectValue.shortTitle === 'string' ? objectValue.shortTitle : '';
  const clickUrl =
    typeof objectValue.clickUrl === 'string' ? objectValue.clickUrl : '';

  if (
    itemId &&
    shortTitle &&
    /(?:item\.taobao\.com|detail\.tmall\.com)\/item\.htm/.test(clickUrl)
  ) {
    items.push({
      itemId,
      shortTitle,
      clickUrl: normalizeUrl(clickUrl),
      price: toStringValue(objectValue.price) || undefined,
      benefit:
        typeof objectValue.benefit === 'string'
          ? objectValue.benefit
          : undefined,
      itemWhiteImg:
        typeof objectValue.itemWhiteImg === 'string'
          ? normalizeUrl(objectValue.itemWhiteImg)
          : undefined,
      cardTitle: nextCardTitle,
    });
  }

  Object.values(objectValue).forEach((item) =>
    collectItems(item, nextCardTitle, items),
  );

  return items;
};

@Injectable()
@HotSource({
  name: 'taobao',
  title: '淘宝',
  type: '首页好货',
  description: '淘宝首页公开静态配置中的商品卡片。',
  link: TAOBAO_HOME_URL,
})
export class TaobaoSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  private async fetchItems(noCache?: boolean): Promise<TaobaoItemsResult> {
    const result = await this.httpService.get<string>({
      url: TAOBAO_HOME_URL,
      noCache,
      responseType: 'text',
      headers: {
        Referer: TAOBAO_HOME_URL,
      },
    });

    let items: TaobaoHomeItem[];
    try {
      items = collectItems(extractStaticConfig(result.data));
    } catch (error) {
      if (result.fromCache && !noCache) {
        return this.fetchItems(true);
      }

      throw error;
    }

    if (items.length === 0 && result.fromCache && !noCache) {
      return this.fetchItems(true);
    }

    return {
      items,
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const result = await this.fetchItems(noCache);

    return {
      data: result.items.map((item) => ({
        id: item.itemId,
        title: item.shortTitle,
        desc: ['淘宝', item.cardTitle, item.benefit]
          .filter(Boolean)
          .join(' · '),
        cover: item.itemWhiteImg,
        hot: item.price ? `¥${item.price}` : undefined,
        timestamp: 0,
        url: item.clickUrl,
        mobileUrl: toTaobaoMobileSearchUrl(item.shortTitle),
      })),
      type: '淘宝首页好货',
      description: '淘宝首页公开静态配置中的商品卡片。',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }
}
