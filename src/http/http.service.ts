import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CacheData, CacheService } from '../cache/cache.service';
import { firstValueFrom, retry, catchError, throwError, timer } from 'rxjs';
import { AxiosError } from 'axios';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';

type ResponseData<T> = {
  fromCache: boolean;
} & CacheData<T>;

// Custom error classes
export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

export class HttpTimeoutError extends HttpRequestError {
  constructor(url: string) {
    super(`Request timeout for ${url}`, url, 408);
    this.name = 'HttpTimeoutError';
  }
}

export class HttpNetworkError extends HttpRequestError {
  constructor(url: string) {
    super(`Network error for ${url}`, url);
    this.name = 'HttpNetworkError';
  }
}

// Base HTTP request options
export interface BaseHttpRequestOptions {
  url: string;
  headers?: Record<string, string>;
  noCache?: boolean;
  ttl?: number;
  timeout?: number; // Request timeout in milliseconds
  retries?: number; // Number of retry attempts
}

// GET request options
export interface HttpGetOptions extends BaseHttpRequestOptions {
  params?: Record<string | number, string | number | boolean | undefined>;
  responseType?:
    | 'json'
    | 'text'
    | 'arraybuffer'
    | 'blob'
    | 'document'
    | 'stream';
}

// POST request options
export interface HttpPostOptions extends BaseHttpRequestOptions {
  data?: Record<string, unknown>;
}

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly inFlight = new Map<string, Promise<ResponseData<unknown>>>();

  constructor(
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableSerialize(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private cacheKey(
    method: 'GET' | 'POST',
    options: HttpGetOptions | HttpPostOptions,
  ): string {
    const headers = Object.fromEntries(
      Object.entries(options.headers ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const request = {
      method,
      url: options.url,
      headers,
      params: 'params' in options ? options.params : undefined,
      data: 'data' in options ? options.data : undefined,
      responseType:
        'responseType' in options ? options.responseType : undefined,
    };
    return `http:${createHash('sha256').update(this.stableSerialize(request)).digest('hex')}`;
  }

  private async singleFlight<T>(
    key: string,
    fetcher: () => Promise<ResponseData<T>>,
  ): Promise<ResponseData<T>> {
    const current = this.inFlight.get(key);
    if (current !== undefined) return current as Promise<ResponseData<T>>;

    const pending = fetcher();
    this.inFlight.set(key, pending as Promise<ResponseData<unknown>>);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }

  private retryDelay(error: unknown, attempt: number) {
    const status =
      error instanceof AxiosError ? error.response?.status : undefined;
    const retryable =
      error instanceof AxiosError &&
      (error.code === 'ECONNABORTED' ||
        !error.response ||
        status === 429 ||
        (status !== undefined && status >= 500));
    if (!retryable) return throwError(() => error);
    return timer(
      Math.min(2000, 250 * 2 ** (attempt - 1)) + Math.random() * 100,
    );
  }

  async invalidateGet(options: HttpGetOptions): Promise<void> {
    await this.cacheService.del(this.cacheKey('GET', options));
  }

  /**
   * 生成随机用户代理
   */
  private getRandomUserAgent(): string {
    // 随机浏览器
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/96.0.4664.53 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/96.0.1054.43 Safari/537.36',
    ];

    // 返回随机浏览器
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * GET请求
   * T 为响应数据类型
   * @param options 请求选项
   * @returns 响应数据
   */
  async get<T = unknown>(options: HttpGetOptions): Promise<ResponseData<T>> {
    const {
      url,
      headers = {},
      params,
      noCache,
      ttl,
      timeout = this.configService.getOrThrow<number>('REQUEST_TIMEOUT'),
      retries = 2,
      responseType = 'json',
    } = options;
    const cacheKey = this.cacheKey('GET', options);
    if (!noCache) {
      // 尝试从缓存获取数据
      const cachedData = await this.cacheService.get<ResponseData<T>>(cacheKey);
      if (cachedData) {
        this.logger.log(`📦 [Redis] Using cached data for ${cacheKey}`);
        return {
          ...cachedData,
          fromCache: true,
        };
      }
    }

    // 添加 User-Agent 头
    const requestHeaders = { ...headers };
    if (!requestHeaders['User-Agent']) {
      requestHeaders['User-Agent'] = this.getRandomUserAgent();
    }

    return this.singleFlight(cacheKey, async () => {
      try {
        const response = await firstValueFrom(
          this.httpService
            .get<T>(url, {
              headers: requestHeaders,
              params,
              timeout,
              responseType,
            })
            .pipe(
              retry({
                count: retries,
                delay: (error, attempt) => this.retryDelay(error, attempt),
              }),
              catchError((error) => {
                throw this.handleHttpError(error, url);
              }),
            ),
        );

        const cacheData: ResponseData<T> = {
          data: response.data,
          updateTime: new Date().toISOString(),
          fromCache: false,
        };
        this.logger.log(`🔄 [API] Fetching fresh data for ${cacheKey}`);
        await this.cacheService.set(cacheKey, cacheData, ttl);
        return cacheData;
      } catch (error) {
        this.logger.error(
          `❌ [API] Error fetching data for ${cacheKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      }
    });
  }

  /**
   * POST请求
   * @param options 请求选项
   * @returns 响应数据
   */
  async post<T = unknown>(options: HttpPostOptions): Promise<ResponseData<T>> {
    const {
      url,
      headers = {},
      data = {},
      noCache,
      ttl,
      timeout = this.configService.getOrThrow<number>('REQUEST_TIMEOUT'),
      retries = 2,
    } = options;
    const cacheKey = this.cacheKey('POST', options);

    if (!noCache) {
      // 尝试从缓存获取数据
      const cachedData = await this.cacheService.get<ResponseData<T>>(cacheKey);
      if (cachedData) {
        this.logger.log(`📦 [Redis] Using cached data for ${cacheKey}`);
        return {
          ...cachedData,
          fromCache: true,
        };
      }
    }

    // 添加 User-Agent 头
    const requestHeaders = { ...headers };
    if (!requestHeaders['User-Agent']) {
      requestHeaders['User-Agent'] = this.getRandomUserAgent();
    }

    return this.singleFlight(cacheKey, async () => {
      try {
        const response = await firstValueFrom(
          this.httpService
            .post<T>(url, data, {
              headers: requestHeaders,
              timeout,
            })
            .pipe(
              retry({
                count: retries,
                delay: (error, attempt) => this.retryDelay(error, attempt),
              }),
              catchError((error) => {
                throw this.handleHttpError(error, url);
              }),
            ),
        );

        const cacheData: ResponseData<T> = {
          data: response.data,
          updateTime: new Date().toISOString(),
          fromCache: false,
        };
        this.logger.log(`🔄 [API] Fetching fresh data for ${cacheKey}`);

        await this.cacheService.set(cacheKey, cacheData, ttl);
        return cacheData;
      } catch (error) {
        this.logger.error(
          `❌ [API] Error posting data for ${cacheKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      }
    });
  }

  /**
   * 处理HTTP错误
   */
  private handleHttpError(error: unknown, url: string): HttpRequestError {
    // 不把查询参数、路径或 AxiosError.config 写入日志；它们可能含凭据。
    let upstream = 'upstream';
    try {
      upstream = new URL(url).origin;
    } catch {
      // 错误 URL 不回显原文。
    }
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED') {
        return new HttpTimeoutError(upstream);
      }
      if (error.response) {
        return new HttpRequestError(
          `HTTP ${error.response.status}: ${error.response.statusText}`,
          upstream,
          error.response.status,
        );
      }
      return new HttpNetworkError(upstream);
    }

    return new HttpRequestError(
      `Unexpected HTTP client error from ${upstream}`,
      upstream,
    );
  }
}
