import { z } from 'zod';
// 板块 code 的唯一事实来源在 registry；registry 只依赖类型定义、不反向
// 依赖 config，因此这里直接引用不会造成循环依赖。
import { NEWS_CATEGORY_PROFILES } from '../news-brief/categories/news-category.registry';

const envBoolean = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined) return fallback;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  }, z.boolean());

export const configValidationSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(6689),
  // 监听地址。默认 0.0.0.0 保持既有行为（容器/反代需要）；
  // 只给本机使用时设为 127.0.0.1，服务就不会暴露到局域网。
  HOST: z
    .string()
    .trim()
    .min(1)
    .default('0.0.0.0')
    .refine((value) => !/\s/u.test(value), 'HOST must not contain whitespace'),
  CACHE_TTL: z.coerce.number().default(3600),
  REQUEST_TIMEOUT: z.coerce.number().int().min(1000).default(6000),
  ALLOWED_DOMAIN: z.string().default('*'),
  RSS_MODE: envBoolean(false),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  NOT_ALLOWED_REFRESH_SOURCE: z.string().default(''),
  IGNORE_SAVE_SOURCES: z.string().default(''),
  MONGODB_URI: z.string().default(''),
  // 定时任务配置
  SCHEDULER_AUTO_START: envBoolean(false),
  SCHEDULER_CRON_EXPRESSION: z.string().default('0 */12 * * *'),
  // 每日简报配置
  BRIEF_ENABLED: envBoolean(false),
  BRIEF_CRON_EXPRESSION: z.string().default('0 12 * * *'),
  BRIEF_TIMEZONE: z.string().default('Asia/Shanghai'),
  BRIEF_SOURCES: z
    .string()
    .default('cls,yicai,wallstreet,jin10,tonghuashun,eastmoney,gelonghui'),
  BRIEF_LOOKBACK_HOURS: z.coerce.number().default(24),
  BRIEF_TOP_ITEMS_PER_SOURCE: z.coerce.number().default(10),
  // 上限与 ai-analysis.client.ts 的 PROMPT_BUDGET.maxTopics 对齐：
  // 超出的主题进不了提示词，只会白付搜索费用，所以启动时就拒绝。
  BRIEF_MAX_TOPICS: z.coerce.number().int().min(1).max(12).default(12),
  // 下限 1：之前靠 service 里的 `ttl > 0 ? ttl : 默认值` 兜底，改为启动时直接拒绝非法值
  BRIEF_STOCK_RANKING_CACHE_TTL: z.coerce.number().min(1).default(43200),
  BRIEF_GENERATING_TIMEOUT_MINUTES: z.coerce.number().min(1).default(30),
  BRIEF_SOURCE_CONCURRENCY: z.coerce.number().min(1).default(3),
  BRIEF_SEARCH_CONCURRENCY: z.coerce.number().min(1).default(3),
  BRIEF_SEARCH_PROVIDERS: z
    .string()
    .default('tavily,deepseek')
    .refine((value) => {
      const names = value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      return (
        names.every((name) => name === 'tavily' || name === 'deepseek') &&
        new Set(names).size === names.length
      );
    }, 'BRIEF_SEARCH_PROVIDERS must contain unique tavily/deepseek names'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_API_BASE_URL: z.string().default(''),
  AI_MODEL: z.string().default('deepseek-v4-flash'),
  AI_TIMEOUT_MS: z.coerce.number().min(1000).default(120000),
  AI_MAX_RETRIES: z.coerce.number().min(0).default(2),
  TAVILY_API_KEY: z.string().default(''),
  TAVILY_MAX_RESULTS: z.coerce.number().default(5),
  TAVILY_TIMEOUT_MS: z.coerce.number().min(1000).default(10000),
  DEEPSEEK_SEARCH_API_KEY: z.string().default(''),
  DEEPSEEK_SEARCH_MAX_RESULTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5),
  DEEPSEEK_SEARCH_TIMEOUT_MS: z.coerce.number().min(1000).default(10000),
  // 通用新闻简报配置
  NEWS_BRIEF_ENABLED: envBoolean(false),
  NEWS_BRIEF_CRON_EXPRESSION: z.string().default('30 8 * * *'),
  NEWS_BRIEF_TIMEZONE: z.string().default('Asia/Shanghai'),
  NEWS_BRIEF_CATEGORIES: z
    .string()
    .default('finance,general,tech,sports')
    .refine(
      (value) => {
        const codes = value
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean);
        // 板块 code 必须唯一且都存在于代码内 registry；放在配置校验里
        // 是为了在建立 Mongo/Redis 连接之前就干净地退出，而不是运行期才失败。
        return (
          codes.length > 0 &&
          new Set(codes).size === codes.length &&
          codes.every((code) =>
            NEWS_CATEGORY_PROFILES.some((profile) => profile.code === code),
          )
        );
      },
      `NEWS_BRIEF_CATEGORIES must contain unique enabled category codes (${NEWS_CATEGORY_PROFILES.map((profile) => profile.code).join(', ')})`,
    ),
  NEWS_BRIEF_LOOKBACK_HOURS: z.coerce.number().min(1).default(24),
  NEWS_BRIEF_TOP_ITEMS_PER_SOURCE: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(8),
  // 上限与 news-brief-ai.client.ts 的 PROMPT_BUDGET 对齐：超出的条目进不了提示词
  NEWS_BRIEF_MAX_CANDIDATES: z.coerce
    .number()
    .int()
    .min(10)
    .max(40)
    .default(40),
  NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY: z.coerce
    .number()
    .int()
    .min(3)
    .max(10)
    .default(8),
  NEWS_BRIEF_SOURCE_CONCURRENCY: z.coerce.number().min(1).default(3),
  NEWS_BRIEF_CATEGORY_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1),
  NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES: z.coerce.number().min(1).default(30),
  // 产品要求前端不允许触发生成接口：默认关闭，仅运维临时开启
  NEWS_BRIEF_MANUAL_GENERATE_ENABLED: envBoolean(false),
  // P1 搜索增强：默认关闭（会产生额外搜索费用）
  NEWS_BRIEF_SEARCH_ENABLED: envBoolean(false),
  NEWS_BRIEF_SEARCH_MAX_QUERIES: z.coerce
    .number()
    .int()
    .min(1)
    .max(8)
    .default(6),
  NEWS_BRIEF_SEARCH_CONCURRENCY: z.coerce.number().min(1).default(3),
  // 产品要求：单条搜索词上限 2000 字
  NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS: z.coerce
    .number()
    .int()
    .min(100)
    .max(2000)
    .default(2000),
  NEWS_BRIEF_SEARCH_PROVIDERS: z
    .string()
    .default('tavily,deepseek')
    .refine((value) => {
      const names = value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      return (
        names.every((name) => name === 'tavily' || name === 'deepseek') &&
        new Set(names).size === names.length
      );
    }, 'NEWS_BRIEF_SEARCH_PROVIDERS must contain unique tavily/deepseek names'),
});

export type ConfigType = z.infer<typeof configValidationSchema>;
