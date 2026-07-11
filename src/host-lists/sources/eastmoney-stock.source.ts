import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import {
  HotListGetListResponse,
  HotListItem,
} from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';

const RANK_API = 'https://emappdata.eastmoney.com/stockrank/getAllCurrentList';
const QUOTE_API = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const SITE_URL = 'https://guba.eastmoney.com/rank/';
const DEFAULT_PAGE_SIZE = 100;

interface EastmoneyRankItem {
  sc: string;
  rk: number;
  rc: number;
  hisRc: number;
}

interface EastmoneyRankResponse {
  code?: number;
  status?: number;
  message?: string;
  data?: EastmoneyRankItem[];
}

interface EastmoneyQuoteItem {
  f2?: number | string;
  f3?: number | string;
  f4?: number | string;
  f5?: number | string;
  f6?: number | string;
  f12?: string;
  f13?: number;
  f14?: string;
}

interface EastmoneyQuoteResponse {
  data?: {
    diff?: EastmoneyQuoteItem[];
  };
}

function stockCodeFromSc(sc: string): string {
  return sc.replace(/^[A-Z]+/i, '');
}

function secidFromSc(sc: string): string | undefined {
  const match = sc.match(/^(SH|SZ|BJ)(\d{6})$/i);
  if (!match) return undefined;

  const [, market, code] = match;
  const marketId = market.toUpperCase() === 'SH' ? 1 : 0;
  return `${marketId}.${code}`;
}

function stockUrlFromSc(sc: string): string {
  const match = sc.match(/^(SH|SZ|BJ)(\d{6})$/i);
  if (!match) return SITE_URL;

  const [, market, code] = match;
  return `https://quote.eastmoney.com/${market.toLowerCase()}${code}.html`;
}

function formatNumber(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null || value === '-') return undefined;
  return String(value);
}

function formatPercent(value: number | string | undefined): string | undefined {
  const formatted = formatNumber(value);
  return formatted ? `${formatted}%` : undefined;
}

function formatRankChange(value: number | undefined): string {
  if (!value) return '持平';
  return value > 0 ? `上升 ${value}` : `下降 ${Math.abs(value)}`;
}

@Injectable()
@HotSource({
  name: 'eastmoney-stock',
  title: '东方财富热股排行',
  type: '财经',
  link: SITE_URL,
  description: '东方财富股吧热股人气排行',
})
export class EastmoneyStockSource implements HotListSource {
  private readonly logger = new Logger(EastmoneyStockSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions = {},
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const result = await this.httpService.post<EastmoneyRankResponse>({
      url: RANK_API,
      noCache: noCache ?? options.noCache,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://guba.eastmoney.com/',
      },
      data: {
        appId: 'appId01',
        globalId: '786e4c21-70dc-435a-93bb-38',
        marketType: '',
        pageNo: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      },
    });

    const rankItems = result.data.data ?? [];
    const quoteByCode = await this.getQuoteByCode(
      rankItems,
      noCache ?? options.noCache,
    );

    const data = rankItems
      .map((item): HotListItem | undefined => {
        const code = stockCodeFromSc(item.sc);
        const quote = quoteByCode.get(code);
        const name = quote?.f14 || item.sc;
        const price = formatNumber(quote?.f2);
        const changePercent = formatPercent(quote?.f3);
        const descParts = [
          code,
          price ? `现价 ${price}` : undefined,
          changePercent ? `涨跌幅 ${changePercent}` : undefined,
          `排名${formatRankChange(item.rc)}`,
          `24小时${formatRankChange(item.hisRc)}`,
        ].filter(Boolean);

        return {
          id: item.sc,
          title: `${name} (${code})`,
          desc: descParts.join(' | '),
          hot: item.rk,
          url: stockUrlFromSc(item.sc),
          mobileUrl: `https://wap.eastmoney.com/quote/stock/${secidFromSc(item.sc) ?? code}.html`,
        };
      })
      .filter((item): item is HotListItem => Boolean(item));

    return {
      data,
      type: '财经',
      fromCache: result.fromCache,
      updateTime: result.updateTime,
    };
  }

  private async getQuoteByCode(
    rankItems: EastmoneyRankItem[],
    noCache?: boolean,
  ): Promise<Map<string, EastmoneyQuoteItem>> {
    const secids = rankItems
      .map((item) => secidFromSc(item.sc))
      .filter((secid): secid is string => Boolean(secid));

    if (secids.length === 0) {
      return new Map();
    }

    try {
      const quoteUrl = new URL(QUOTE_API);
      quoteUrl.searchParams.set('fltt', '2');
      quoteUrl.searchParams.set('invt', '2');
      quoteUrl.searchParams.set('fields', 'f2,f3,f4,f5,f6,f12,f13,f14');
      quoteUrl.searchParams.set('secids', secids.join(','));

      const result = await this.httpService.get<EastmoneyQuoteResponse>({
        url: quoteUrl.toString(),
        noCache,
        timeout: 10000,
        headers: {
          Referer: 'https://guba.eastmoney.com/',
        },
      });

      return new Map(
        (result.data.data?.diff ?? [])
          .filter((item): item is EastmoneyQuoteItem & { f12: string } =>
            Boolean(item.f12),
          )
          .map((item) => [item.f12, item]),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to enrich Eastmoney stock quotes: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return new Map();
    }
  }
}
