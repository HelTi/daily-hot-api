import { get } from 'http';
import { probeHost } from './run-state';

/** 读取响应体的上限，避免把非本服务的大响应全部读进内存。 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * 校验响应是否来自 daily-hot-api 的 /health。
 *
 * 只看 HTTP 状态码不够：端口可能被其他服务占用，任何 200 都会被当成
 * 本服务「健康」，status/start 就会给出错误结论。本服务的 /health 固定返回
 * `{ status, checks: { ... } }`，用这个形状做判定。
 */
export function looksLikeHealthBody(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) {
      return false;
    }
    const value = parsed as Record<string, unknown>;
    return (
      typeof value.status === 'string' &&
      typeof value.checks === 'object' &&
      value.checks !== null
    );
  } catch {
    return false;
  }
}

/** 请求 /health，2xx 且响应体形状属于本服务时才视为就绪。 */
export function checkHealth(
  port: number,
  timeoutMs = 2000,
  host = '127.0.0.1',
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (healthy: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(healthy);
    };

    const request = get(
      { host: probeHost(host), port, path: '/health', timeout: timeoutMs },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          finish(false);
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          if (body.length <= MAX_BODY_BYTES) {
            body += chunk;
          }
        });
        response.on('end', () => finish(looksLikeHealthBody(body)));
        response.on('error', () => finish(false));
      },
    );
    request.on('timeout', () => {
      request.destroy();
      finish(false);
    });
    request.on('error', () => {
      finish(false);
    });
  });
}
