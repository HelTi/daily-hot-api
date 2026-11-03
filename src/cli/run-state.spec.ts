import { type ChildProcess, spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  clearRunState,
  isPortInUse,
  isProcessAlive,
  parseRunState,
  probeHost,
  processLooksLikeService,
  readRunState,
  waitForProcessExit,
  writeRunState,
  type RunState,
} from './run-state';

function makeState(overrides: Partial<RunState> = {}): RunState {
  return {
    pid: process.pid,
    port: 6689,
    host: '0.0.0.0',
    mode: 'foreground',
    startedAt: new Date().toISOString(),
    cwd: process.cwd(),
    envFile: null,
    logFile: null,
    version: '0.1.0',
    entry: 'daily-hot-api',
    ...overrides,
  };
}

async function spawnIdleProcess(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
    stdio: 'ignore',
  });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  return child;
}

/** 用给定脚本路径启动一个空转进程，让 ps 看到的命令行包含该路径。 */
async function spawnScriptProcess(scriptPath: string): Promise<ChildProcess> {
  writeFileSync(scriptPath, 'setTimeout(() => {}, 60000);\n');
  const child = spawn(process.execPath, [scriptPath], { stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  return child;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  try {
    process.kill(child.pid, 'SIGKILL');
  } catch {
    // 进程可能已经退出。
  }
  await exited;
}

describe('run-state', () => {
  const tempDirs: string[] = [];
  const children: ChildProcess[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dha-state-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (children.length > 0) {
      const child = children.pop();
      if (child) {
        await stopChild(child);
      }
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('写入、读取并清理运行状态', () => {
    const stateFile = join(makeTempDir(), 'daily-hot-api.json');
    const state = makeState({ port: 7000, mode: 'daemon' });

    writeRunState(stateFile, state);
    expect(readRunState(stateFile)).toEqual({ state, corrupt: false });

    expect(clearRunState(stateFile, state.pid)).toBe('cleared');
    expect(readRunState(stateFile)).toEqual({ state: null, corrupt: false });
    expect(clearRunState(stateFile)).toBe('missing');
  });

  it('损坏或字段非法的状态文件标记为 corrupt', () => {
    const dir = makeTempDir();
    const brokenFile = join(dir, 'broken.json');
    writeFileSync(brokenFile, '{ not json');
    expect(readRunState(brokenFile)).toEqual({ state: null, corrupt: true });

    const invalidFile = join(dir, 'invalid.json');
    writeFileSync(invalidFile, JSON.stringify({ pid: -1 }));
    expect(readRunState(invalidFile)).toEqual({ state: null, corrupt: true });
  });

  it('清理时校验 pid，避免误删其他实例的状态', () => {
    const stateFile = join(makeTempDir(), 'daily-hot-api.json');
    writeRunState(stateFile, makeState({ pid: 12345 }));
    expect(clearRunState(stateFile, 99999)).toBe('kept');
    expect(readRunState(stateFile).state?.pid).toBe(12345);
  });

  it('parseRunState 补齐可选字段并拒绝非法 pid', () => {
    expect(parseRunState({ pid: 0, port: 6689, mode: 'daemon' })).toBeNull();
    const parsed = parseRunState({
      pid: 42,
      port: 6689,
      mode: 'daemon',
      startedAt: new Date().toISOString(),
    });
    expect(parsed?.cwd).toBe('');
    expect(parsed?.logFile).toBeNull();
    // 旧版本写的状态文件没有 host 字段，按 0.0.0.0 处理。
    expect(parsed?.host).toBe('');
  });

  it('probeHost 把通配地址换成回环地址', () => {
    expect(probeHost('0.0.0.0')).toBe('127.0.0.1');
    expect(probeHost('::')).toBe('127.0.0.1');
    expect(probeHost('')).toBe('127.0.0.1');
    expect(probeHost(undefined)).toBe('127.0.0.1');
    expect(probeHost('10.0.0.5')).toBe('10.0.0.5');
  });

  it('processLooksLikeService 认得 bin 入口，不认只含包名的无关进程', async () => {
    const dir = makeTempDir();
    const binDir = join(dir, 'bin');
    mkdirSync(binDir, { recursive: true });

    const serviceEntry = join(binDir, 'daily-hot-api.js');
    const serviceChild = await spawnScriptProcess(serviceEntry);
    children.push(serviceChild);
    expect(
      processLooksLikeService(serviceChild.pid as number, {
        entry: serviceEntry,
        packageRoot: dir,
      }),
    ).toBe(true);

    // 命令行里只是路径含包名（仓库目录、状态目录、日志路径都是这种情况），
    // 不能被当成本服务，否则 PID 复用时会误杀。
    const strangerDir = join(dir, 'daily-hot-api');
    mkdirSync(strangerDir, { recursive: true });
    const strangerChild = await spawnScriptProcess(
      join(strangerDir, 'noop.js'),
    );
    children.push(strangerChild);
    expect(
      processLooksLikeService(strangerChild.pid as number, {
        entry: serviceEntry,
        packageRoot: dir,
      }),
    ).toBe(false);
  });

  it('processLooksLikeService 对已退出的进程返回 false', async () => {
    const child = await spawnIdleProcess();
    const pid = child.pid as number;
    await stopChild(child);
    expect(processLooksLikeService(pid)).toBe(false);
  });

  it('isProcessAlive 判断当前进程和已退出的子进程', async () => {
    expect(isProcessAlive(process.pid)).toBe(true);

    const child = await spawnIdleProcess();
    children.push(child);
    expect(child.pid).toBeDefined();
    expect(isProcessAlive(child.pid as number)).toBe(true);

    await stopChild(child);
    expect(isProcessAlive(child.pid as number)).toBe(false);
  });

  it('waitForProcessExit 在超时内等到进程退出', async () => {
    const child = await spawnIdleProcess();
    children.push(child);
    const pid = child.pid as number;

    expect(await waitForProcessExit(pid, 200)).toBe(false);

    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    });
    process.kill(pid, 'SIGKILL');
    await exited;
    expect(await waitForProcessExit(pid, 2000)).toBe(true);
  });

  it('isPortInUse 能识别监听中的端口', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;

    expect(await isPortInUse(port)).toBe(true);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    expect(await isPortInUse(port)).toBe(false);
  });
});
