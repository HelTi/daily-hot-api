import { get } from 'http';
import { sleep } from './run-state';

/** 请求 /health，HTTP 状态码 2xx/3xx 都视为服务已就绪。 */
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
      { host, port, path: '/health', timeout: timeoutMs },
      (response) => {
        response.resume();
        const statusCode = response.statusCode ?? 0;
        finish(statusCode >= 200 && statusCode < 400);
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

export async function waitForHealthy(
  port: number,
  timeoutMs: number,
  intervalMs = 250,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await checkHealth(port)) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(intervalMs);
  } while (Date.now() < deadline);
  return false;
}
