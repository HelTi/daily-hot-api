import { z } from 'zod';

export const configValidationSchema = z.object({
  PORT: z.coerce.number().default(6689),
  DISALLOW_ROBOT: z.preprocess(
    (val) => val === 'true',
    z.boolean().default(true),
  ),
  CACHE_TTL: z.coerce.number().default(3600),
  REQUEST_TIMEOUT: z.coerce.number().default(6000),
  ALLOWED_DOMAIN: z.string().default('*'),
  ALLOWED_HOST: z.string().default('ttkit.cn'),
  USE_LOG_FILE: z.preprocess(
    (val) => val === 'true',
    z.boolean().default(true),
  ),
  RSS_MODE: z.preprocess((val) => val === 'true', z.boolean().default(false)),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  NOT_ALLOWED_REFRESH_SOURCE: z.string().default(''),
});

export type ConfigType = z.infer<typeof configValidationSchema>;
