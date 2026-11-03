/**
 * daily-hot-api CLI 发现与调用。
 *
 * 策略（对应 references/ 里的“版本策略”）：
 *   1. DAILY_HOT_API_CLI 指定的命令优先（测试/特殊安装路径用）；
 *   2. PATH 里已有 daily-hot-api 且版本 >= CLI_PIN 时直接使用（本地优先）；
 *   3. 否则用 `npx --yes @ttkit/daily-hot-api@<CLI_PIN>`，禁用 @latest。
 *
 * 不引入第三方依赖，Node 22.20+ 可直接运行。
 */

import { spawn } from 'node:child_process';
import os from 'node:os';

import {
  EXIT_CODES,
  SkillError,
  prerequisiteError,
} from './errors.mjs';

export const CLI_PKG = '@ttkit/daily-hot-api';
export const CLI_PIN = '0.1.3';
export const MIN_NODE_VERSION = '22.20.0';

const IS_WINDOWS = process.platform === 'win32';
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * 执行 CLI 时使用的中立工作目录。
 *
 * 不能继承当前 cwd：npx 看到 cwd 所在项目能提供同名 bin 时（package.json
 * 声明了 `daily-hot-api`，或存在 node_modules/.bin/daily-hot-api），会直接
 * 跑那个命令而无视 `@<version>`，CLI_PIN 就被静默绕过——实测在
 * daily-hot-api 仓库里 `npx --yes @ttkit/daily-hot-api@0.1.3 --version`
 * 会输出全局的 0.1.2。中立目录同时避免 CLI 读到用户 cwd 的 .env。
 */
function neutralCwd() {
  return os.tmpdir();
}

/**
 * detectCli() 的结果在单次进程内缓存。
 *
 * 每次 runCli 都重新探测会多 spawn 一个 `daily-hot-api --version`，
 * 一条 skill 命令可能调用 CLI 多次，白等好几百毫秒。
 */
let cachedCli = null;

export function parseVersion(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: match[0],
  };
}

export function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left;
  const b = typeof right === 'string' ? parseVersion(right) : right;
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function nodeVersionInfo() {
  const current = process.versions.node;
  const supported = compareVersions(current, MIN_NODE_VERSION) >= 0;
  const recommended = compareVersions(current, '24.0.0') >= 0;
  return {
    version: current,
    minimum: MIN_NODE_VERSION,
    supported,
    recommended,
    // daily-hot-api 包的 engines 仍声明 >=24，这里只做提示，不阻断。
    note: recommended
      ? undefined
      : 'daily-hot-api 包 engines 声明 >=24；当前 Node 版本非官方声明范围，但本 skill 已在 22.23.2 实测通过。',
  };
}

function assertNodeVersion() {
  const info = nodeVersionInfo();
  if (info.supported) return info;
  throw prerequisiteError(
    `需要 Node.js >= ${MIN_NODE_VERSION}（当前 ${info.version}）。请升级 Node 后重试，例如安装 Node 24 LTS。`,
    { node: info },
  );
}

/** Windows 下用 shell 才方便解析 npx.cmd / 全局命令。 */
function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 执行一个命令并收集输出。
 * @param {string} command
 * @param {string[]} args
 * @param {{timeoutMs?: number, env?: Record<string,string>, cwd?: string}} [options]
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export function runCommand(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnArgs = IS_WINDOWS ? args.map(quoteWindowsArg) : args;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, spawnArgs, {
        cwd: options.cwd ?? neutralCwd(),
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: IS_WINDOWS,
        windowsHide: true,
      });
    } catch (error) {
      reject(
        prerequisiteError(
          `无法执行命令 ${command}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        prerequisiteError(
          `无法执行命令 ${command}: ${error.message}`,
          { cause: error.message },
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new SkillError(
            `命令超时（${Math.round(timeoutMs / 1000)} 秒）：${command} ${args.join(' ')}`,
            {
              exitCode: EXIT_CODES.SERVICE,
              code: 'timeout',
              details: { command, args },
            },
          ),
        );
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function probeGlobalCli() {
  try {
    const result = await runCommand('daily-hot-api', ['--version'], {
      timeoutMs: 10_000,
    });
    if (result.code !== 0) return null;
    const version = parseVersion(result.stdout)?.raw ?? null;
    return version ? { version } : null;
  } catch {
    return null;
  }
}

/**
 * 只探测，不触发 npx 下载。doctor / status 用。
 * @returns {Promise<{kind: 'env'|'global'|'npx', command: string, prefixArgs: string[], version: string|null, globalVersion: string|null, note: string}>}
 */
/** 仅测试用：清掉 detectCli 的进程内缓存。 */
export function clearCliCache() {
  cachedCli = null;
}

export async function detectCli() {
  if (cachedCli) return cachedCli;
  cachedCli = await probeCli();
  return cachedCli;
}

async function probeCli() {
  assertNodeVersion();

  const override = process.env.DAILY_HOT_API_CLI?.trim();
  if (override) {
    return {
      kind: 'env',
      command: override,
      prefixArgs: [],
      version: null,
      globalVersion: null,
      note: '使用 DAILY_HOT_API_CLI 指定的命令。',
    };
  }

  const globalCli = await probeGlobalCli();
  if (globalCli && compareVersions(globalCli.version, CLI_PIN) >= 0) {
    return {
      kind: 'global',
      command: 'daily-hot-api',
      prefixArgs: [],
      version: globalCli.version,
      globalVersion: globalCli.version,
      note: '使用 PATH 中的全局 daily-hot-api。',
    };
  }

  return {
    kind: 'npx',
    command: 'npx',
    prefixArgs: ['--yes', `${CLI_PKG}@${CLI_PIN}`],
    version: CLI_PIN,
    globalVersion: globalCli?.version ?? null,
    note:
      globalCli && compareVersions(globalCli.version, CLI_PIN) < 0
        ? `PATH 中的 daily-hot-api 版本 ${globalCli.version} 低于 ${CLI_PIN}，回退到固定版本的 npx。`
        : `未找到全局 daily-hot-api，首次运行会通过 npx 下载 ${CLI_PKG}@${CLI_PIN}（约 1 MB）。`,
  };
}

/** ensure 等需要真实执行 CLI 的场景用这个：会解析到可执行的命令。 */
export async function resolveCli() {
  return detectCli();
}

/**
 * 运行 CLI 并把非 0 退出码转换成 SkillError。
 * @param {string[]} args
 * @param {{timeoutMs?: number, env?: Record<string,string>, cwd?: string, tolerateFailure?: boolean}} [options]
 */
export async function runCli(args, options = {}) {
  const cli = await resolveCli();
  const result = await runCommand(
    cli.command,
    [...cli.prefixArgs, ...args],
    options,
  );

  if (result.code !== 0 && !options.tolerateFailure) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    throw new SkillError(
      `daily-hot-api CLI 执行失败（退出码 ${result.code}）：${args.join(' ')}\n${tailLines(output, 20)}`,
      {
        exitCode: EXIT_CODES.PREREQUISITE,
        code: 'cli_failed',
        details: {
          args,
          exitCode: result.code,
          cli: cli.kind,
          output: tailLines(output, 40),
        },
      },
    );
  }

  return { ...result, cli };
}

function tailLines(text, count) {
  const lines = String(text).trimEnd().split(/\r?\n/u);
  return lines.slice(Math.max(0, lines.length - count)).join('\n');
}

export { assertNodeVersion, neutralCwd, IS_WINDOWS };
