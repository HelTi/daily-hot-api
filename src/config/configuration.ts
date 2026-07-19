import { ConfigType } from './validation.schema';

export default (): ConfigType => ({
  PORT: parseInt(process.env.PORT) || 6689,
  DISALLOW_ROBOT: process.env.DISALLOW_ROBOT === 'true',
  CACHE_TTL: parseInt(process.env.CACHE_TTL) || 3600,
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 6000,
  ALLOWED_DOMAIN: process.env.ALLOWED_DOMAIN || '*',
  ALLOWED_HOST: process.env.ALLOWED_HOST || 'localhost',
  USE_LOG_FILE: process.env.USE_LOG_FILE === 'true',
  RSS_MODE: process.env.RSS_MODE === 'true',
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  NOT_ALLOWED_REFRESH_SOURCE: process.env.NOT_ALLOWED_REFRESH_SOURCE || '',
  IGNORE_SAVE_SOURCES: process.env.IGNORE_SAVE_SOURCES || '',
  MONGODB_URI: process.env.MONGODB_URI || '',
  // 定时任务配置
  SCHEDULER_AUTO_START: process.env.SCHEDULER_AUTO_START === 'true',
  SCHEDULER_CRON_EXPRESSION:
    process.env.SCHEDULER_CRON_EXPRESSION || '0 */12 * * *',
  BACKUP_CRON_EXPRESSION: process.env.BACKUP_CRON_EXPRESSION || '0 1 * * *',
  // 每日简报配置
  BRIEF_ENABLED: process.env.BRIEF_ENABLED === 'true',
  BRIEF_CRON_EXPRESSION: process.env.BRIEF_CRON_EXPRESSION || '0 12 * * *',
  BRIEF_TIMEZONE: process.env.BRIEF_TIMEZONE || 'Asia/Shanghai',
  BRIEF_SOURCES: process.env.BRIEF_SOURCES || 'cls,eastmoney,gelonghui',
  BRIEF_LOOKBACK_HOURS: parseInt(process.env.BRIEF_LOOKBACK_HOURS) || 24,
  BRIEF_TOP_ITEMS_PER_SOURCE:
    parseInt(process.env.BRIEF_TOP_ITEMS_PER_SOURCE) || 10,
  BRIEF_MAX_TOPICS: parseInt(process.env.BRIEF_MAX_TOPICS) || 12,
  BRIEF_STOCK_RANKING_CACHE_TTL:
    parseInt(process.env.BRIEF_STOCK_RANKING_CACHE_TTL) || 43200,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_API_BASE_URL: process.env.OPENAI_API_BASE_URL || '',
  AI_MODEL: process.env.AI_MODEL || 'deepseek-v4-flash',
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
  TAVILY_MAX_RESULTS: parseInt(process.env.TAVILY_MAX_RESULTS) || 5,
});
