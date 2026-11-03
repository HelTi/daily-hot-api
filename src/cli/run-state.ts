import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { connect } from 'net';
import { dirname, join } from 'path';
import { APP_NAME, getPackageRoot } from './paths';

export type RunMode = 'foreground' | 'daemon';

/** 写入状态目录的运行状态，供 status/stop/restart 使用。 */
export interface RunState {
  pid: number;
  port: number;
  /** 实际监听地址（HOST / --host）；空字符串表示旧状态文件，按 0.0.0.0 处理。 */
  host: string;
  mode: RunMode;
  startedAt: string;
  cwd: string;
  envFile: string | null;
  logFile: string | null;
  version: string;
  /** 启动入口，用于校验 PID 是否仍是本服务，避免 PID 复用误杀。 */
  entry: string;
}

export interface RunStateReadResult {
  state: RunState | null;
  corrupt: boolean;
}

export function parseRunState(raw: unknown): RunState | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const pid = value.pid;
  const port = value.port;
  if (
    typeof pid !== 'number' ||
    !Number.isInteger(pid) ||
    pid <= 0 ||
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }
  if (value.mode !== 'foreground' && value.mode !== 'daemon') {
    return null;
  }
  if (typeof value.startedAt !== 'string') {
    return null;
  }
  return {
    pid,
    port,
    host: typeof value.host === 'string' ? value.host : '',
    mode: value.mode,
    startedAt: value.startedAt,
    cwd: typeof value.cwd === 'string' ? value.cwd : '',
    envFile: typeof value.envFile === 'string' ? value.envFile : null,
    logFile: typeof value.logFile === 'string' ? value.logFile : null,
    version: typeof value.version === 'string' ? value.version : 'unknown',
    entry: typeof value.entry === 'string' ? value.entry : '',
  };
}

export function readRunState(stateFile: string): RunStateReadResult {
  if (!existsSync(stateFile)) {
    return { state: null, corrupt: false };
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFile, 'utf8'));
    const state = parseRunState(parsed);
    return { state, corrupt: state === null };
  } catch {
    return { state: null, corrupt: true };
  }
}

export function writeRunState(stateFile: string, state: RunState): void {
  mkdirSync(dirname(stateFile), { recursive: true });
  const tempFile = `${stateFile}.${process.pid}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    renameSync(tempFile, stateFile);
  } catch {
    // Windows 上 rename 覆盖已存在文件可能失败，先删除再重试。
    rmSync(stateFile, { force: true });
    renameSync(tempFile, stateFile);
  }
}

/**
 * 清理状态文件。
 * 传了 expectedPid 时只在记录的 pid 一致时删除，避免误删新实例的状态。
 */
export function clearRunState(
  stateFile: string,
  expectedPid?: number,
): 'cleared' | 'kept' | 'missing' {
  if (!existsSync(stateFile)) {
    return 'missing';
  }
  if (expectedPid !== undefined) {
    const { state } = readRunState(stateFile);
    if (state && state.pid !== expectedPid) {
      return 'kept';
    }
  }
  rmSync(stateFile, { force: true });
  return 'cleared';
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 尽量确认 pid 仍是 daily-hot-api 进程。
 *
 * 通过 ps 查看命令行，命中「状态文件记录的入口」或本包的 bin/dist 入口路径才算匹配。
 * 不要只匹配包名：仓库目录、状态目录和日志路径里都含 daily-hot-api，
 * 任何在这些路径上工作的无关进程都会被误判，PID 复用时会被误杀。
 * Windows 或 ps 不可用时退回「存活即可」，避免误杀保护导致 stop 失效。
 */
export function processLooksLikeService(
  pid: number,
  options: { entry?: string; packageRoot?: string } = {},
): boolean {
  if (!isProcessAlive(pid)) {
    return false;
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8',
    timeout: 2000,
  });
  if (result.error || result.status !== 0 || !result.stdout) {
    return true;
  }
  const commandLine = result.stdout.trim();
  if (!commandLine) {
    return true;
  }
  const packageRoot = options.packageRoot ?? getPackageRoot();
  const markers = [
    // 状态文件记录的绝对入口最精确。
    options.entry,
    join(packageRoot, 'bin', `${APP_NAME}.js`),
    join(packageRoot, 'dist', 'main.js'),
    join(packageRoot, 'dist', 'cli', 'index.js'),
    // 换一个安装位置执行 stop（npx 缓存目录不同）或用相对路径启动时的兜底，
    // 仍然要求包名出现在 bin 入口路径里，而不是命令行任意位置。
    `bin/${APP_NAME}.js`,
    `bin\\${APP_NAME}.js`,
  ].filter((marker): marker is string => Boolean(marker));
  return markers.some((marker) => commandLine.includes(marker));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForProcessExit(
  pid: number,
  timeoutMs: number,
  intervalMs = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await sleep(intervalMs);
  }
  return !isProcessAlive(pid);
}

/**
 * 把监听地址换成可探测的连接地址。
 *
 * 0.0.0.0 / :: / 空值代表「所有网卡」，连回环即可；
 * 绑定到具体地址时必须连那个地址，否则端口探测和健康检查都会假阴性。
 */
export function probeHost(host: string | undefined): string {
  const value = (host ?? '').trim();
  if (!value || value === '0.0.0.0' || value === '::' || value === '*') {
    return '127.0.0.1';
  }
  return value;
}

/** 检查端口是否有进程在监听（默认只探测本机回环地址）。 */
export function isPortInUse(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 500,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (inUse: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(inUse);
    };
    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
