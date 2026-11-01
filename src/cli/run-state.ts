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
import { dirname } from 'path';
import { APP_NAME, getPackageRoot } from './paths';

export type RunMode = 'foreground' | 'daemon';

/** 写入状态目录的运行状态，供 status/stop/restart 使用。 */
export interface RunState {
  pid: number;
  port: number;
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
 * 通过 ps 查看命令行，命中包目录名或 dist 入口则认为匹配；
 * Windows 或 ps 不可用时退回「存活即可」，避免误杀保护导致 stop 失效。
 */
export function processLooksLikeService(
  pid: number,
  packageRoot: string = getPackageRoot(),
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
  const markers = [
    APP_NAME,
    `${packageRoot}/dist/main.js`,
    `${packageRoot}/dist/cli/index.js`,
    `${packageRoot}\\dist\\main.js`,
  ];
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
