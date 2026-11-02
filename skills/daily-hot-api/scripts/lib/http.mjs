/**
 * 极小的 HTTP 客户端封装：固定超时、JSON 解析、错误分类。
 * 只用 Node 内置 fetch（Node 22.20+ 可用），不引入第三方依赖。
 */

import {
  EXIT_CODES,
  SkillError,
  serviceError,
  usageError,
} from './errors.mjs';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * @param {string} input
 * @returns {string} 去除末尾斜杠的 http(s) 地址
 */
export function normalizeBaseUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw usageError('base URL 不能为空。');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw usageError(`base URL 不是合法 URL：${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw usageError(`base URL 只支持 http/https：${raw}`);
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/u, '');
}

/**
 * @param {string} baseUrl
 * @param {string} path 以 / 开头的路径
 * @param {{query?: Record<string, unknown>, timeoutMs?: number}} [options]
 * @returns {Promise<any>}
 */
export async function requestJson(baseUrl, path, options = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new SkillError(
        `服务返回 HTTP ${response.status}：${path}${describeBodyHint(text)}`,
        {
          exitCode:
            response.status >= 500
              ? EXIT_CODES.SERVICE
              : EXIT_CODES.USAGE,
          code: 'http_error',
          details: {
            status: response.status,
            url: url.toString(),
            body: truncate(text, 500),
          },
        },
      );
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw serviceError(`服务返回的不是 JSON：${path}`, {
        url: url.toString(),
        body: truncate(text, 500),
      });
    }
  } catch (error) {
    if (error instanceof SkillError) throw error;
    if (error?.name === 'AbortError') {
      throw new SkillError(
        `请求超时（${Math.round(timeoutMs / 1000)} 秒）：${url.toString()}`,
        {
          exitCode: EXIT_CODES.SERVICE,
          code: 'timeout',
          details: { url: url.toString() },
        },
      );
    }
    throw new SkillError(
      `无法连接服务 ${base}：${error instanceof Error ? error.message : String(error)}。可先运行 doctor/ensure 检查服务状态。`,
      {
        exitCode: EXIT_CODES.SERVICE,
        code: 'network',
        details: { url: url.toString() },
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} baseUrl
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{ok: boolean, status?: string, checks?: object}>}
 */
export async function getHealth(baseUrl, options = {}) {
  try {
    const data = await requestJson(baseUrl, '/health', {
      timeoutMs: options.timeoutMs ?? 3_000,
    });
    if (!looksLikeDailyHotService(data)) {
      return { ok: false };
    }
    return { ok: true, status: data.status ?? 'unknown', checks: data.checks };
  } catch {
    return { ok: false };
  }
}

/**
 * /ready 在 MongoDB 未连接时返回 503，这里不抛错，只返回状态。
 * @param {string} baseUrl
 * @returns {Promise<{ready: boolean, status: number|null}>}
 */
export async function getReady(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  try {
    const response = await fetch(new URL('/ready', base), {
      signal: AbortSignal.timeout(3_000),
      headers: { accept: 'application/json' },
    });
    return { ready: response.ok, status: response.status };
  } catch {
    return { ready: false, status: null };
  }
}

function looksLikeDailyHotService(data) {
  return Boolean(
    data &&
      typeof data === 'object' &&
      typeof data.status === 'string' &&
      data.checks &&
      typeof data.checks === 'object',
  );
}

function describeBodyHint(text) {
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return `（${parsed.message}）`;
  } catch {
    // 忽略：可能不是 JSON
  }
  return '';
}

export function truncate(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
