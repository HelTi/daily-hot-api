import { z } from 'zod';

const envBoolean = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined) return fallback;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  }, z.boolean());

export const configValidationSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(6689),
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
  BRIEF_MAX_TOPICS: z.coerce.number().default(12),
  // 下限 1：之前靠 service 里的 `ttl > 0 ? ttl : 默认值` 兜底，改为启动时直接拒绝非法值
  BRIEF_STOCK_RANKING_CACHE_TTL: z.coerce.number().min(1).default(43200),
  BRIEF_GENERATING_TIMEOUT_MINUTES: z.coerce.number().min(1).default(30),
  BRIEF_SOURCE_CONCURRENCY: z.coerce.number().min(1).default(3),
  BRIEF_SEARCH_CONCURRENCY: z.coerce.number().min(1).default(3),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_API_BASE_URL: z.string().default(''),
  AI_MODEL: z.string().default('deepseek-v4-flash'),
  AI_TIMEOUT_MS: z.coerce.number().min(1000).default(120000),
  AI_MAX_RETRIES: z.coerce.number().min(0).default(2),
  TAVILY_API_KEY: z.string().default(''),
  TAVILY_MAX_RESULTS: z.coerce.number().default(5),
  TAVILY_TIMEOUT_MS: z.coerce.number().min(1000).default(10000),
});

export type ConfigType = z.infer<typeof configValidationSchema>;
