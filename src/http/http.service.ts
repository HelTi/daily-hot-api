import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CacheData, CacheService } from '../cache/cache.service';
import { firstValueFrom, retry, catchError } from 'rxjs';
import { AxiosError } from 'axios';

type ResponseData<T> = {
  fromCache: boolean;
} & CacheData<T>;

// Custom error classes
export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

export class HttpTimeoutError extends HttpRequestError {
  constructor(url: string, originalError?: Error) {
    super(`Request timeout for ${url}`, url, 408, originalError);
    this.name = 'HttpTimeoutError';
  }
}

export class HttpNetworkError extends HttpRequestError {
  constructor(url: string, originalError?: Error) {
    super(`Network error for ${url}`, url, undefined, originalError);
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

  constructor(
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService,
  ) {}

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
      timeout = 10000,
      retries = 2,
      responseType = 'json',
    } = options;
    const cacheKey = `http:${url}`;
    if (noCache) {
      this.logger.log(`🗑️ [Redis] Deleting cache for ${cacheKey}`);
      await this.cacheService.del(cacheKey);
    } else {
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
            retry(retries),
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
        `❌ [API] Error fetching data from ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
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
      timeout = 10000,
      retries = 2,
    } = options;
    const cacheKey = `http:${url}`;

    if (noCache) {
      this.logger.log(`🗑️ [Redis] Deleting cache for ${cacheKey}`);
      await this.cacheService.del(cacheKey);
    } else {
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

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<T>(url, data, {
            headers: requestHeaders,
            timeout,
          })
          .pipe(
            retry(retries),
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
        `❌ [API] Error posting data to ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * 处理HTTP错误
   */
  private handleHttpError(error: unknown, url: string): HttpRequestError {
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED') {
        return new HttpTimeoutError(url, error);
      }
      if (error.response) {
        return new HttpRequestError(
          `HTTP ${error.response.status}: ${error.response.statusText}`,
          url,
          error.response.status,
          error,
        );
      }
      return new HttpNetworkError(url, error);
    }

    return new HttpRequestError(
      error instanceof Error ? error.message : JSON.stringify(error),
      url,
      undefined,
      error instanceof Error ? error : undefined,
    );
  }
}
