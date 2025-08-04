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
});
