import { Injectable, Logger } from '@nestjs/common';
import { HotSource } from '../decorators/hot-source.decorator';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';
import { HttpClientService } from '../../http/http.service';
import { GetListOptions } from './source.types';
import * as cheerio from 'cheerio';

type TrendingType = 'daily' | 'weekly' | 'monthly';

const typeMap: Record<TrendingType, string> = {
  daily: '日榜',
  weekly: '周榜',
  monthly: '月榜',
};

interface RepoInfo {
  owner: string;
  repo: string;
  url: string;
  description: string;
  language: string;
  stars: string;
  forks: string;
  todayStars?: string | number;
}

function isTrendingType(value: string): value is TrendingType {
  return ['daily', 'weekly', 'monthly'].includes(value as TrendingType);
}

@Injectable()
@HotSource({
  name: 'github',
  title: 'GitHub',
  type: '趋势',
  link: 'https://github.com/trending',
})
export class GitHubSource implements HotListSource {
  private readonly logger = new Logger(GitHubSource.name);

  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const typeParam = options?.type || 'daily';
    const type = isTrendingType(typeParam) ? typeParam : 'daily';

    const repos = await this.getTrendingRepos(type, noCache);

    return {
      data: repos.map((repo, index) => ({
        id: index,
        title: repo.repo,
        desc: repo.description,
        cover: '',
        author: repo.owner,
        timestamp: 0,
        hot: repo.stars,
        url: repo.url,
        mobileUrl: repo.url,
      })),
      type: typeMap[type],
      params: {
        type: {
          name: '排行榜分区',
          type: typeMap,
        },
      },
    };
  }

  private async getTrendingRepos(
    type: TrendingType,
    noCache?: boolean,
  ): Promise<RepoInfo[]> {
    const url = `https://github.com/trending?since=${type}`;

    try {
      const result = await this.httpService.get<string>({
        url,
        noCache,
        ttl: 60 * 60 * 24, // 24小时缓存
        retries: 3, // 最大重试3次
        timeout: 20000, // 20秒超时
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
      });
      this.logger.log(`✅ Successfully fetched GitHub trending for ${type}`);
      return this.parseGitHubTrendingHTML(result.data);
    } catch (error) {
      this.logger.error(`❌ Failed to fetch GitHub trending`, error);
      throw new Error(`Failed to fetch GitHub trending: ${error.message}`);
    }
  }

  private parseGitHubTrendingHTML(html: string): RepoInfo[] {
    const $ = cheerio.load(html);
    const results: RepoInfo[] = [];

    $('article.Box-row').each((_, el) => {
      const $el = $(el);

      // 仓库标题和链接 (在 <h2> > <a> 里)
      const $repoAnchor = $el.find('h2 a');

      // 可能出现 "owner / repo" 这种文本
      const fullNameText = $repoAnchor
        .text()
        .trim()
        .replace(/\r?\n/g, '') // 去掉换行
        .replace(/\s+/g, ' ') // 多空格处理
        .split('/')
        .map((s) => s.trim());

      const owner = fullNameText[0] || '';
      const repoName = fullNameText[1] || '';

      // href 即仓库链接
      const repoUrl = 'https://github.com' + $repoAnchor.attr('href');

      // 仓库描述 (<p class="col-9 color-fg-muted ...">)
      const description = $el.find('p.col-9.color-fg-muted').text().trim();

      // 语言 (<span itemprop="programmingLanguage">)
      const language = $el
        .find('[itemprop="programmingLanguage"]')
        .text()
        .trim();

      // Stars 数量
      const starsText = $el.find('a[href$="/stargazers"]').text().trim();

      // Forks 数量
      const forksText = $el.find('a[href$="/forks"]').text().trim();

      // 今日 Stars (可选)
      const todayStarsElement = $el.find('span.d-inline-block.float-sm-right');
      const todayStars = todayStarsElement.text().trim();

      results.push({
        owner,
        repo: repoName,
        url: repoUrl || '',
        description,
        language,
        stars: starsText,
        forks: forksText,
        todayStars: todayStars || undefined,
      });
    });

    this.logger.log(
      `📊 Parsed ${results.length} repositories from GitHub trending`,
    );
    return results;
  }
}
