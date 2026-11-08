import { NewsCategoryProfile } from '../interfaces/news-brief.interface';

/**
 * 板块注册表：唯一板块定义源。
 *
 * `NEWS_BRIEF_CATEGORIES` 只决定启用哪些板块及顺序，板块的名称、定位、
 * 数据源、目标条数都在这里静态声明。新增板块 = 加一个 profile +
 * 在 registry.spec.ts 里补断言，不需要改 service/controller/DTO。
 *
 * 数据源必须存在于 `HOT_LIST_SOURCES`（src/host-lists/sources/index.ts），
 * 启动时 NewsBriefScheduler 会与 HotListsService 的实际注册表比对并报错。
 */
export const NEWS_CATEGORY_PROFILES: NewsCategoryProfile[] = [
  {
    code: 'finance',
    name: '财经',
    description: '货币政策、市场与公司事件、产业经济、宏观数据',
    focus:
      '关注货币政策与监管动向、市场与公司重大事件、宏观数据、产业经济；只做新闻整理，不做个股推荐或产业链映射。',
    sources: [
      'cls',
      'yicai',
      'wallstreet',
      'jin10',
      'tonghuashun',
      'eastmoney',
      'gelonghui',
      'caixin',
    ],
    maxItems: 8,
    search: true,
  },
  {
    code: 'general',
    name: '综合新闻',
    description: '社会、时政、国际、民生、公共事件',
    focus:
      '关注社会民生、时政、国际、公共安全与突发事件；优先选取影响面大、可核实的事实性新闻。',
    sources: [
      'thepaper',
      'qq-news',
      'netease-news',
      'sina-news',
      'toutiao',
      'baidu',
      'weibo',
      'zhihu',
    ],
    maxItems: 8,
    search: true,
  },
  {
    code: 'tech',
    name: '科技',
    description: 'AI、半导体、消费电子、互联网产品、开发者生态',
    focus:
      '关注 AI 与大模型、半导体与硬件、消费电子、互联网产品、开发者生态与开源动态。',
    sources: [
      '36kr',
      'ithome',
      'huxiu',
      'geekpark',
      'ifanr',
      'sspai',
      'juejin',
      'xinyu',
    ],
    maxItems: 8,
    search: true,
  },
  {
    code: 'sports',
    name: '体育',
    description: '赛事结果与赛程、运动员与俱乐部动态、体育产业',
    focus:
      '关注国内外主要赛事结果与赛程、运动员与俱乐部动态、转会与伤病、体育产业与赛事运营；避免编造比分和未公布的阵容。',
    sources: [
      'hupu',
      'weibo',
      'baidu',
      'zhihu',
      'toutiao',
      'tieba',
      'bilibili',
      'sina-news',
    ],
    maxItems: 8,
    search: true,
  },
];

export function listNewsCategoryProfiles(): NewsCategoryProfile[] {
  return NEWS_CATEGORY_PROFILES;
}

export function getNewsCategoryProfile(
  code: string,
): NewsCategoryProfile | undefined {
  return NEWS_CATEGORY_PROFILES.find((profile) => profile.code === code);
}

/**
 * 把 `NEWS_BRIEF_CATEGORIES` 解析成 profile 列表：保持顺序、去重，
 * 未知 code 抛错（启动阶段 fail fast，避免运行期生成未知板块）。
 */
export function resolveNewsCategories(codes: string[]): NewsCategoryProfile[] {
  const result: NewsCategoryProfile[] = [];
  const seen = new Set<string>();

  for (const raw of codes) {
    const code = raw.trim();
    if (!code || seen.has(code)) continue;
    const profile = getNewsCategoryProfile(code);
    if (!profile) {
      throw new Error(
        `Unknown news brief category "${code}". Available: ${NEWS_CATEGORY_PROFILES.map(
          (item) => item.code,
        ).join(', ')}`,
      );
    }
    seen.add(code);
    result.push(profile);
  }

  if (result.length === 0) {
    throw new Error(
      'NEWS_BRIEF_CATEGORIES must contain at least one enabled category',
    );
  }

  return result;
}
