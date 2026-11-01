import { ConfigService } from '@nestjs/config';
import { type ChildProcess, spawn } from 'child_process';
import { closeSync, mkdirSync, openSync, writeSync } from 'fs';
import { join } from 'path';
import type { CliOptions } from '../args';
import type { CommandContext } from '../context';
import { applyEnvFile, resolvePort } from '../env';
import { CliError, EXIT_CODES } from '../errors';
import { checkHealth } from '../health';
import { tailFile } from '../log-file';
import { field, info, warn } from '../output';
import {
  APP_NAME,
  DAEMON_CHILD_ENV,
  START_POLL_INTERVAL_MS,
  START_TIMEOUT_MS,
  buildCliPaths,
  getBinPath,
  getPackageVersion,
  resolveEnvFile,
  resolveHomeDir,
  type CliPaths,
} from '../paths';
import {
  clearRunState,
  isPortInUse,
  isProcessAlive,
  processLooksLikeService,
  readRunState,
  sleep,
  waitForProcessExit,
  writeRunState,
  type RunMode,
  type RunState,
} from '../run-state';

interface StartTarget {
  cwd: string;
  env: NodeJS.ProcessEnv;
  paths: CliPaths;
  port: number;
  envFile: string | null;
}

interface DaemonReadyResult {
  ok: boolean;
  reason?: 'exited' | 'timeout';
  exitCode?: number | null;
}

export async function startCommand(
  options: CliOptions,
  context: Partial<CommandContext> = {},
): Promise<number> {
  const cwd = context.cwd ?? process.cwd();
  const env = context.env ?? process.env;
  const homeDir = resolveHomeDir({ home: options.home, cwd, env });
  const paths = buildCliPaths(homeDir);

  const envResolution = resolveEnvFile({
    cwd,
    homeDir,
    envFile: options.envFile,
    env,
  });
  if (envResolution) {
    applyEnvFile(envResolution.path, env);
  }

  const port = resolvePort(options.port, env);
  env.PORT = String(port);

  assertNoRunningInstance(paths);

  if (await isPortInUse(port)) {
    throw new CliError(
      `端口 ${port} 已被其他进程占用，请使用 --port 指定其他端口，或先停止占用进程`,
    );
  }

  const target: StartTarget = {
    cwd,
    env,
    paths,
    port,
    envFile: envResolution?.path ?? null,
  };

  if (options.daemon) {
    return startDaemon(target);
  }

  // 内部标记读完即删，避免被应用或后续逻辑继续继承。
  const daemonChild = env[DAEMON_CHILD_ENV] === '1';
  delete env[DAEMON_CHILD_ENV];
  return startForeground(target, daemonChild ? 'daemon' : 'foreground');
}

/** 创建状态目录，把文件系统原始错误转换成可操作的提示。 */
function ensureStateDir(homeDir: string): void {
  try {
    mkdirSync(join(homeDir, 'logs'), { recursive: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `无法创建状态目录 ${homeDir}: ${reason}。请检查 --home / DAILY_HOT_API_HOME 是否指向可写的目录`,
    );
  }
}

/** 已存在存活的本服务实例时拒绝启动；过期/损坏状态直接清理。 */
function assertNoRunningInstance(paths: CliPaths): void {
  const existing = readRunState(paths.stateFile);

  if (existing.corrupt) {
    warn(`运行状态文件损坏，已清理: ${paths.stateFile}`);
    clearRunState(paths.stateFile);
    return;
  }

  const state = existing.state;
  if (!state) {
    return;
  }

  if (isProcessAlive(state.pid)) {
    if (processLooksLikeService(state.pid)) {
      throw new CliError(
        `热点服务已在运行（PID ${state.pid}，端口 ${state.port}）。如需重启请运行: ${APP_NAME} restart`,
      );
    }
    throw new CliError(
      `运行状态文件记录的 PID ${state.pid} 仍存活，但无法确认是 ${APP_NAME} 进程。` +
        `请先执行 ${APP_NAME} stop --force 终止并清理状态文件，或手动删除 ${paths.stateFile}`,
    );
  }

  warn(`清理过期运行状态（PID ${state.pid} 已退出）`);
  clearRunState(paths.stateFile, state.pid);
}

async function startForeground(
  target: StartTarget,
  mode: RunMode,
): Promise<number> {
  info(`正在启动 ${APP_NAME}（${mode === 'daemon' ? '后台' : '前台'}模式）...`);
  info(`端口: ${target.port}`);
  if (target.envFile) {
    info(`配置文件: ${target.envFile}`);
  }
  info(`状态目录: ${target.paths.homeDir}`);

  const state: RunState = {
    pid: process.pid,
    port: target.port,
    mode,
    startedAt: new Date().toISOString(),
    cwd: target.cwd,
    envFile: target.envFile,
    logFile: mode === 'daemon' ? target.paths.logFile : null,
    version: getPackageVersion(),
    entry: getBinPath(),
  };

  // 先写状态再启动：启动期间 stop 也能找到进程；失败时不会残留无法管理的实例。
  try {
    writeRunState(target.paths.stateFile, state);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `无法写入运行状态文件（状态目录不可用）: ${reason}。请检查 --home / DAILY_HOT_API_HOME 是否指向可写的目录`,
    );
  }

  // 任何退出路径（Ctrl+C、stop、崩溃）都清理状态文件，避免留下过期 PID。
  // Nest 的 shutdown hook 处理完信号后会重新抛出同一信号，进程会以信号退出，
  // 此时不会触发 exit 事件；因此信号处理里也要同步清理一次。
  // 使用 once 注册，首次信号后监听器自动移除，不会拦截 Nest 重抛的信号。
  const clearStateFile = (): void => {
    try {
      clearRunState(target.paths.stateFile, process.pid);
    } catch {
      // 退出阶段无法补救，忽略清理异常。
    }
  };
  process.once('exit', clearStateFile);
  process.once('SIGINT', clearStateFile);
  process.once('SIGTERM', clearStateFile);
  process.once('SIGHUP', clearStateFile);

  const { bootstrap } = await import('../../main');
  let app: Awaited<ReturnType<typeof bootstrap>>;
  try {
    app = await bootstrap();
  } catch (error) {
    clearStateFile();
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`服务启动失败: ${reason}`);
  }

  const config = app.get(ConfigService);
  const actualPort = config.getOrThrow<number>('PORT');
  if (actualPort !== state.port) {
    // 正常情况下 resolvePort 已保证一致；这里只做兜底同步。
    state.port = actualPort;
    try {
      writeRunState(target.paths.stateFile, state);
    } catch {
      // 端口展示不一致不影响服务运行。
    }
  }

  info(`热点服务已启动: http://localhost:${actualPort}`);
  if (mode === 'daemon') {
    info(`PID: ${process.pid}`);
    info(`日志: ${target.paths.logFile}`);
  } else {
    info(`PID: ${process.pid}，按 Ctrl+C 停止服务`);
  }
  return EXIT_CODES.ok;
}

async function startDaemon(target: StartTarget): Promise<number> {
  ensureStateDir(target.paths.homeDir);
  let logFd: number;
  try {
    logFd = openSync(target.paths.logFile, 'a');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `无法写入日志文件 ${target.paths.logFile}: ${reason}。请检查状态目录是否可写`,
    );
  }
  const startedAt = new Date().toISOString();
  writeSync(
    logFd,
    `\n[${startedAt}] ${APP_NAME} background start (port=${target.port}${
      target.envFile ? `, env_file=${target.envFile}` : ''
    })\n`,
  );

  const childArgs = [getBinPath(), 'start', '--home', target.paths.homeDir];
  if (target.envFile) {
    childArgs.push('--config', target.envFile);
  }
  const childEnv: NodeJS.ProcessEnv = {
    ...target.env,
    PORT: String(target.port),
    [DAEMON_CHILD_ENV]: '1',
  };

  let child: ChildProcess;
  try {
    child = spawn(process.execPath, childArgs, {
      cwd: target.cwd,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: childEnv,
      windowsHide: true,
    });
  } catch (error) {
    closeSync(logFd);
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`后台进程创建失败: ${reason}`);
  }
  // 子进程已复制 fd，父进程可以关闭自己的副本。
  closeSync(logFd);
  child.unref();

  const childPid = child.pid;
  if (!childPid) {
    throw new CliError('后台进程创建失败: 未返回进程 PID');
  }

  info(`正在后台启动 ${APP_NAME}（PID ${childPid}）...`);
  const ready = await waitForDaemonReady(
    childPid,
    child,
    target.port,
    target.paths.stateFile,
  );

  if (!ready.ok) {
    await terminateFailedChild(childPid, target.paths.stateFile);
    const reason =
      ready.reason === 'timeout'
        ? `等待服务就绪超时（${Math.round(START_TIMEOUT_MS / 1000)} 秒）`
        : `后台进程提前退出（退出码 ${ready.exitCode ?? 'unknown'}）`;
    const logTail = safeTailLog(target.paths.logFile, 30);
    throw new CliError(
      [
        `后台启动失败: ${reason}`,
        `日志: ${target.paths.logFile}`,
        logTail ? `最近日志:\n${logTail}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  info(`热点服务已在后台启动: http://localhost:${target.port}`);
  field('PID', childPid);
  field('日志', target.paths.logFile);
  info(
    `停止: ${APP_NAME} stop    状态: ${APP_NAME} status    日志: ${APP_NAME} logs -f`,
  );
  return EXIT_CODES.ok;
}

async function waitForDaemonReady(
  pid: number,
  child: ChildProcess,
  port: number,
  stateFile: string,
): Promise<DaemonReadyResult> {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid) || child.exitCode !== null) {
      return { ok: false, reason: 'exited', exitCode: child.exitCode };
    }

    const { state } = readRunState(stateFile);
    if (state?.pid === pid && (await checkHealth(port))) {
      return { ok: true };
    }

    await sleep(START_POLL_INTERVAL_MS);
  }

  return { ok: false, reason: 'timeout' };
}

async function terminateFailedChild(
  pid: number,
  stateFile: string,
): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // 进程可能已经退出。
  }
  if (!(await waitForProcessExit(pid, 3000))) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // 进程可能已经退出。
    }
    await waitForProcessExit(pid, 2000);
  }
  clearRunState(stateFile, pid);
}

function safeTailLog(logFile: string, lines: number): string {
  try {
    return tailFile(logFile, lines);
  } catch {
    return '';
  }
}
