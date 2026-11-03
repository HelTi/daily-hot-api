import type { CliOptions } from '../args';
import type { CommandContext } from '../context';
import { CliError, EXIT_CODES } from '../errors';
import { info, progress, warn } from '../output';
import { APP_NAME, buildCliPaths, resolveHomeDir } from '../paths';
import {
  clearRunState,
  isProcessAlive,
  processLooksLikeService,
  readRunState,
  waitForProcessExit,
} from '../run-state';

export interface StopOutcome {
  stopped: boolean;
  stale: boolean;
  forced: boolean;
  pid?: number;
  port?: number;
  message: string;
}

export async function stopCommand(
  options: CliOptions,
  context: Partial<CommandContext> = {},
): Promise<number> {
  const outcome = await stopService(options, context);
  if (options.json) {
    console.log(JSON.stringify(outcome));
  } else {
    info(outcome.message);
  }
  return outcome.stopped ? EXIT_CODES.ok : EXIT_CODES.error;
}

export async function stopService(
  options: CliOptions,
  context: Partial<CommandContext> = {},
): Promise<StopOutcome> {
  const cwd = context.cwd ?? process.cwd();
  const env = context.env ?? process.env;
  const homeDir = resolveHomeDir({ home: options.home, cwd, env });
  const paths = buildCliPaths(homeDir);
  const existing = readRunState(paths.stateFile);

  if (existing.corrupt) {
    clearRunState(paths.stateFile);
    return {
      stopped: true,
      stale: true,
      forced: false,
      message: `运行状态文件损坏，已清理: ${paths.stateFile}（热点服务未在运行）`,
    };
  }

  const state = existing.state;
  if (!state) {
    return {
      stopped: true,
      stale: false,
      forced: false,
      message: '热点服务未在运行',
    };
  }

  if (!isProcessAlive(state.pid)) {
    clearRunState(paths.stateFile, state.pid);
    return {
      stopped: true,
      stale: true,
      forced: false,
      pid: state.pid,
      port: state.port,
      message: `热点服务未在运行（PID ${state.pid} 已退出，已清理过期状态文件）`,
    };
  }

  const trusted = processLooksLikeService(state.pid, { entry: state.entry });
  if (!trusted && !options.force) {
    // 保留状态文件，方便用户重试 `stop --force`；不要对来历不明的进程发信号。
    return {
      stopped: false,
      stale: false,
      forced: false,
      pid: state.pid,
      port: state.port,
      message:
        `PID ${state.pid} 存在但无法确认是 ${APP_NAME} 进程，已跳过停止。` +
        `若确认该进程属于本服务，请执行: ${APP_NAME} stop --force；或手动删除状态文件 ${paths.stateFile}`,
    };
  }

  if (options.force) {
    warn(`--force: 直接发送 SIGKILL 终止 PID ${state.pid}`);
    try {
      process.kill(state.pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw new CliError(
          `发送 SIGKILL 失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const killed = await waitForProcessExit(state.pid, 5000);
    if (!killed && isProcessAlive(state.pid)) {
      throw new CliError(
        `无法终止进程 ${state.pid}，请手动执行: kill -9 ${state.pid}`,
      );
    }
    clearRunState(paths.stateFile, state.pid);
    return {
      stopped: true,
      stale: false,
      forced: true,
      pid: state.pid,
      port: state.port,
      message: `已强制停止热点服务（PID ${state.pid}）`,
    };
  }

  progress(`正在停止热点服务（PID ${state.pid}，端口 ${state.port}）...`);
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      clearRunState(paths.stateFile, state.pid);
      return {
        stopped: true,
        stale: true,
        forced: false,
        pid: state.pid,
        port: state.port,
        message: `热点服务未在运行（PID ${state.pid} 已退出，已清理过期状态文件）`,
      };
    }
    throw new CliError(
      `发送停止信号失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let forced = false;
  const exited = await waitForProcessExit(
    state.pid,
    options.timeoutSeconds * 1000,
  );
  if (!exited) {
    forced = true;
    warn(`进程在 ${options.timeoutSeconds} 秒内未退出，发送 SIGKILL`);
    try {
      process.kill(state.pid, 'SIGKILL');
    } catch {
      // 进程可能刚刚退出。
    }
    const killed = await waitForProcessExit(state.pid, 5000);
    if (!killed && isProcessAlive(state.pid)) {
      throw new CliError(
        `无法停止进程 ${state.pid}，请手动执行: kill -9 ${state.pid}`,
      );
    }
  }

  clearRunState(paths.stateFile, state.pid);
  return {
    stopped: true,
    stale: false,
    forced,
    pid: state.pid,
    port: state.port,
    message: forced
      ? `已强制停止热点服务（PID ${state.pid}）`
      : `热点服务已停止（PID ${state.pid}）`,
  };
}
