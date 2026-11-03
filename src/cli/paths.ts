import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join, resolve } from 'path';

export const APP_NAME = 'daily-hot-api';

/** 应用默认端口，与 src/config/validation.schema.ts 的 PORT 默认值保持一致。 */
export const DEFAULT_PORT = 6689;

/** 应用默认监听地址，与 src/config/validation.schema.ts 的 HOST 默认值保持一致。 */
export const DEFAULT_HOST = '0.0.0.0';

/** stop/restart 等待进程退出的默认超时时间（秒）。 */
export const DEFAULT_STOP_TIMEOUT_SECONDS = 10;

/** 后台启动时等待服务就绪的最大时间。 */
export const START_TIMEOUT_MS = 60_000;

/** 后台启动时每轮轮询的间隔。 */
export const START_POLL_INTERVAL_MS = 200;

/** CLI 专用的环境变量：覆盖状态目录（默认 ~/.daily-hot-api）。 */
export const HOME_ENV = 'DAILY_HOT_API_HOME';

/** CLI 专用的环境变量：显式指定 .env 文件。 */
export const ENV_FILE_ENV = 'DAILY_HOT_API_ENV_FILE';

/**
 * 内部标记：后台子进程启动时由父进程注入，用来把运行状态标记为 daemon。
 * 不属于公开配置，不会写入文档。
 */
export const DAEMON_CHILD_ENV = 'DAILY_HOT_API_DAEMON_CHILD';

export interface CliPaths {
  homeDir: string;
  stateFile: string;
  logDir: string;
  logFile: string;
}

export interface EnvFileResolution {
  path: string;
  /** true 表示来自 --config / DAILY_HOT_API_ENV_FILE，缺失时应直接报错。 */
  explicit: boolean;
}

/** 编译后 dist/cli/paths.js 的包根目录为仓库/安装包根目录。 */
export function getPackageRoot(): string {
  return resolve(__dirname, '..', '..');
}

/** 已发布的 bin 入口，后台子进程通过它重新进入 CLI。 */
export function getBinPath(): string {
  return join(getPackageRoot(), 'bin', `${APP_NAME}.js`);
}

export function getPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(getPackageRoot(), 'package.json'), 'utf8'),
    ) as { version?: unknown };
    return typeof packageJson.version === 'string'
      ? packageJson.version
      : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 状态目录解析顺序：--home > DAILY_HOT_API_HOME > ~/.daily-hot-api。
 * 相对路径基于当前工作目录解析。
 */
export function resolveHomeDir(options: {
  home?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = options.env ?? process.env;
  const raw = options.home?.trim() || env[HOME_ENV]?.trim();
  if (!raw) {
    return join(homedir(), `.${APP_NAME}`);
  }
  return isAbsolute(raw) ? resolve(raw) : resolve(options.cwd, raw);
}

export function buildCliPaths(homeDir: string): CliPaths {
  const logDir = join(homeDir, 'logs');
  return {
    homeDir,
    stateFile: join(homeDir, `${APP_NAME}.json`),
    logDir,
    logFile: join(logDir, `${APP_NAME}.log`),
  };
}

/**
 * 配置文件解析顺序：
 * 1. --config
 * 2. DAILY_HOT_API_ENV_FILE
 * 3. <cwd>/.env
 * 4. <home>/.env
 * 显式指定的文件即使不存在也会返回，由 applyEnvFile 给出明确报错。
 */
export function resolveEnvFile(options: {
  cwd: string;
  homeDir: string;
  envFile?: string;
  env?: NodeJS.ProcessEnv;
}): EnvFileResolution | undefined {
  const env = options.env ?? process.env;
  const explicit = options.envFile?.trim() || env[ENV_FILE_ENV]?.trim();
  if (explicit) {
    return {
      path: isAbsolute(explicit)
        ? resolve(explicit)
        : resolve(options.cwd, explicit),
      explicit: true,
    };
  }

  const cwdEnvFile = join(options.cwd, '.env');
  if (existsSync(cwdEnvFile)) {
    return { path: cwdEnvFile, explicit: false };
  }

  const homeEnvFile = join(options.homeDir, '.env');
  if (existsSync(homeEnvFile)) {
    return { path: homeEnvFile, explicit: false };
  }

  return undefined;
}
