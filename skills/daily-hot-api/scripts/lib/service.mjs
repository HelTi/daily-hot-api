/**
 * 服务实例发现与生命周期管理。
 *
 * 解析顺序（高 → 低）：
 *   1. --base-url / DAILY_HOT_API_BASE_URL（远程或用户已部署实例，只读）
 *   2. skill 专属状态目录（~/.daily-hot-api-skill，由本 skill 启动）
 *   3. 本机默认实例 http://127.0.0.1:6689（用户自己启动的，只读，绝不 stop）
 *   4. 自动启动一个隔离实例（最小配置：不开简报、不连 Mongo）
 *
 * 自动启动的实例只用最小配置，避免读取用户 cwd 的 .env、避免用户 AI Key
 * 或 Mongo 历史数据通过网卡暴露（当前服务端监听 0.0.0.0，见 SKILL.md 安全说明）。
 */

import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { CLI_PIN, runCli } from './cli.mjs';
import {
  EXIT_CODES,
  SkillError,
  prerequisiteError,
  serviceError,
} from './errors.mjs';
import { getHealth, getReady, normalizeBaseUrl } from './http.mjs';

export const DEFAULT_PORT = 6689;
const START_TIMEOUT_MS = 90_000;

/**
 * 默认探测端口。用户已有实例若跑在自定义端口，可设置 DAILY_HOT_API_LOCAL_PORT
 * 让 skill 自动发现；不设置时为 6689。
 */
export function resolveLocalDefaultPort() {
  const raw = process.env.DAILY_HOT_API_LOCAL_PORT?.trim();
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return DEFAULT_PORT;
  }
  return port;
}
const HEALTH_POLL_INTERVAL_MS = 500;

export function resolveSkillHome() {
  const configured = process.env.DAILY_HOT_API_SKILL_HOME?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), '.daily-hot-api-skill');
}

export function buildSkillPaths(home = resolveSkillHome()) {
  return {
    home,
    configFile: path.join(home, 'skill.env'),
    markerFile: path.join(home, '.started-by-skill'),
    logFile: path.join(home, 'logs', 'daily-hot-api.log'),
  };
}

export async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(prerequisiteError('无法分配空闲端口。'));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function choosePort() {
  const preferred = resolveLocalDefaultPort();
  if (await isPortFree(preferred)) return preferred;
  return findEphemeralPort();
}

/**
 * 读取 skill 专属状态目录里 CLI 记录的状态。
 * 未运行或状态损坏时返回 null，不抛错。
 */
export async function readSkillServiceStatus(home = resolveSkillHome()) {
  try {
    const result = await runCli(['status', '--json', '--home', home], {
      timeoutMs: 20_000,
      tolerateFailure: true,
    });
    const parsed = parseJsonOutput(result.stdout);
    if (!parsed || parsed.running !== true || !parsed.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseJsonOutput(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function writeSkillConfig(paths, port) {
  await mkdir(paths.home, { recursive: true });
  const content = [
    '# 由 daily-hot-api agent skill 自动生成，请勿手改。',
    '# 这是隔离的最小配置：不读取用户 .env，不启用简报，不连接用户 Mongo。',
    `PORT=${port}`,
    '# 只绑定回环地址：隔离实例不需要暴露到局域网。',
    '# 需要 CLI >= 0.1.3；旧版本会忽略这个变量（仍监听所有网卡）。',
    'HOST=127.0.0.1',
    'BRIEF_ENABLED=false',
    'SCHEDULER_AUTO_START=false',
    '# 故意指向不可达地址，避免误连用户本机 MongoDB 里的历史数据。',
    'MONGODB_URI=mongodb://127.0.0.1:1/daily-hot-api-skill-disabled',
    'REDIS_HOST=127.0.0.1',
    '',
  ].join('\n');
  await writeFile(paths.configFile, content, { encoding: 'utf8', mode: 0o600 });
}

async function writeMarker(paths, payload) {
  await mkdir(paths.home, { recursive: true });
  await writeFile(
    paths.markerFile,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}

async function waitForHealthy(baseUrl, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await getHealth(baseUrl, { timeoutMs: 2_000 });
    if (health.ok) return health;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
  }
  return { ok: false };
}

/**
 * 只探测，不启动。status / doctor 使用。
 * @param {{baseUrl?: string}} [options]
 */
export async function inspectService(options = {}) {
  const explicit = options.baseUrl ?? process.env.DAILY_HOT_API_BASE_URL;
  if (explicit) {
    const baseUrl = normalizeBaseUrl(explicit);
    const health = await getHealth(baseUrl);
    const ready = health.ok ? await getReady(baseUrl) : { ready: false };
    return {
      found: health.ok,
      source: 'configured',
      baseUrl,
      readOnly: true,
      health,
      ready,
    };
  }

  const home = resolveSkillHome();

  // 先用 marker 里记录的地址直接探 /health：命中就省掉一次 CLI 子进程
  // （detectCli 的版本探测 + `status --json`），这是最常走的路径。
  const marker = await readMarker(home);
  if (marker?.baseUrl) {
    const baseUrl = normalizeBaseUrl(marker.baseUrl);
    const health = await getHealth(baseUrl);
    if (health.ok) {
      return {
        found: true,
        source: 'skill',
        baseUrl,
        readOnly: false,
        health,
        ready: await getReady(baseUrl),
        cliVersion: marker.cliVersion,
        port: marker.port,
      };
    }
  }

  const skillStatus = await readSkillServiceStatus(home);
  if (skillStatus) {
    const baseUrl = normalizeBaseUrl(skillStatus.url);
    const health = await getHealth(baseUrl);
    if (health.ok) {
      return {
        found: true,
        source: 'skill',
        baseUrl,
        readOnly: false,
        health,
        ready: await getReady(baseUrl),
        cliVersion: skillStatus.version,
        pid: skillStatus.pid,
        port: skillStatus.port,
      };
    }
  }

  const localBaseUrl = `http://127.0.0.1:${resolveLocalDefaultPort()}`;
  const localHealth = await getHealth(localBaseUrl);
  if (localHealth.ok) {
    return {
      found: true,
      source: 'local',
      baseUrl: localBaseUrl,
      readOnly: true,
      health: localHealth,
      ready: await getReady(localBaseUrl),
    };
  }

  return {
    found: false,
    source: null,
    baseUrl: null,
    readOnly: true,
    health: { ok: false },
    ready: { ready: false },
  };
}

/**
 * 确保有可用实例，必要时自动启动。
 * @param {{baseUrl?: string, autoStart?: boolean}} [options]
 */
export async function ensureService(options = {}) {
  const explicitBaseUrl = options.baseUrl ?? process.env.DAILY_HOT_API_BASE_URL;
  const inspected = await inspectService({ baseUrl: options.baseUrl });
  if (inspected.found) return inspected;

  // 用户显式指定了实例地址却连不上：直接报错，不要偷偷启动本地实例。
  if (explicitBaseUrl) {
    throw serviceError(
      `无法连接已配置的 daily-hot-api 实例：${normalizeBaseUrl(explicitBaseUrl)}。请确认服务已启动、地址与端口正确。`,
      { baseUrl: normalizeBaseUrl(explicitBaseUrl) },
    );
  }

  if (options.autoStart === false) {
    throw new SkillError(
      '未找到可用的 daily-hot-api 服务，且当前命令不允许自动启动。',
      {
        exitCode: EXIT_CODES.NOT_RUNNING,
        code: 'not_running',
      },
    );
  }

  return startIsolatedService();
}

async function startIsolatedService() {
  const home = resolveSkillHome();
  const paths = buildSkillPaths(home);

  // 上次 skill 启动的实例已经不健康（inspectService 探不到），但进程可能还在。
  // 先停掉它再起新的，避免越积越多的僵尸实例；失败也继续，由 CLI 的
  // 状态文件校验兜底。
  if (await fileExists(paths.markerFile)) {
    await runCli(['stop', '--json', '--home', home], {
      timeoutMs: 30_000,
      tolerateFailure: true,
    });
    await rm(paths.markerFile, { force: true });
  }

  const port = await choosePort();
  await writeSkillConfig(paths, port);

  const result = await runCli(
    [
      'start',
      '-d',
      '--home',
      home,
      '--config',
      paths.configFile,
      '--port',
      String(port),
    ],
    { timeoutMs: START_TIMEOUT_MS, tolerateFailure: true },
  );

  if (result.code !== 0) {
    throw prerequisiteError(
      `daily-hot-api 启动失败（退出码 ${result.code}）。修复建议见 references/troubleshooting.md。`,
      {
        cli: result.cli.kind,
        cliVersion: CLI_PIN,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        home,
        logFile: paths.logFile,
        configFile: paths.configFile,
      },
    );
  }

  const baseUrl = `http://127.0.0.1:${port}`;

  // CLI 已经确认进程起来了，marker 必须在健康检查之前写：
  // 否则健康检查失败就留下一个「本 skill 启动但没有标记」的孤儿实例，
  // 之后 stop 会以为没东西要停。
  await writeMarker(paths, {
    port,
    baseUrl,
    startedAt: new Date().toISOString(),
    cliVersion: result.cli.version ?? CLI_PIN,
  });

  const health = await waitForHealthy(baseUrl);
  if (!health.ok) {
    throw serviceError(
      '服务进程已启动，但 /health 不可达。请查看日志排查，确认后可执行 stop 停止该实例。',
      {
        baseUrl,
        home,
        logFile: paths.logFile,
        configFile: paths.configFile,
      },
    );
  }

  return {
    found: true,
    source: 'started',
    baseUrl,
    readOnly: false,
    health,
    ready: await getReady(baseUrl),
    port,
    home,
    configFile: paths.configFile,
    logFile: paths.logFile,
  };
}

/**
 * 只停止本 skill 启动的实例；用户自己启动的实例绝不触碰。
 */
export async function stopSkillService() {
  const home = resolveSkillHome();
  const paths = buildSkillPaths(home);

  if (!(await fileExists(paths.markerFile))) {
    return {
      stopped: false,
      reason: '当前状态目录没有“由 skill 启动”的标记，未执行停止。',
      skillHome: home,
    };
  }

  const result = await runCli(['stop', '--json', '--home', home], {
    timeoutMs: 30_000,
    tolerateFailure: true,
  });
  const parsed = parseJsonOutput(result.stdout);

  if (result.code !== 0) {
    // 保留 marker：实例可能还在跑，删掉标记就等于再也停不掉它。
    throw serviceError(
      '停止服务失败，实例可能仍在运行。标记文件已保留，可重试 stop；' +
        '若 CLI 提示无法确认 PID，按它给的命令手动处理。',
      {
        home,
        markerFile: paths.markerFile,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        exitCode: result.code,
      },
    );
  }

  await rm(paths.markerFile, { force: true });

  return {
    stopped: true,
    skillHome: home,
    cliResult: parsed ?? { exitCode: result.code },
  };
}

export async function readMarker(home = resolveSkillHome()) {
  return readJsonFile(buildSkillPaths(home).markerFile);
}
