import { DEFAULT_LOG_LINES, type CliOptions } from '../args';
import type { CommandContext } from '../context';
import { CliError, EXIT_CODES } from '../errors';
import { info, warn } from '../output';
import { APP_NAME, buildCliPaths, resolveHomeDir } from '../paths';
import {
  isProcessAlive,
  processLooksLikeService,
  readRunState,
  type RunMode,
} from '../run-state';
import { startCommand } from './start';
import { stopCommand } from './stop';

export async function restartCommand(
  options: CliOptions,
  context: Partial<CommandContext> = {},
): Promise<number> {
  const cwd = context.cwd ?? process.cwd();
  const env = context.env ?? process.env;
  const homeDir = resolveHomeDir({ home: options.home, cwd, env });
  const paths = buildCliPaths(homeDir);
  const existing = readRunState(paths.stateFile);

  if (
    existing.state &&
    isProcessAlive(existing.state.pid) &&
    !processLooksLikeService(existing.state.pid, {
      entry: existing.state.entry,
    })
  ) {
    throw new CliError(
      `运行状态文件记录的 PID ${existing.state.pid} 仍存活，但无法确认是 ${APP_NAME} 进程。` +
        `请先执行 ${APP_NAME} stop --force 终止并清理状态文件，或手动删除 ${paths.stateFile}`,
    );
  }

  const runningState =
    existing.state &&
    isProcessAlive(existing.state.pid) &&
    processLooksLikeService(existing.state.pid, {
      entry: existing.state.entry,
    })
      ? existing.state
      : null;

  // 默认沿用上一次的端口、配置文件和运行模式。
  const mode: RunMode = options.daemon
    ? 'daemon'
    : options.foreground
      ? 'foreground'
      : (runningState?.mode ?? 'foreground');
  const port = options.port ?? runningState?.port;
  const host = options.host ?? runningState?.host ?? undefined;
  const envFile = options.envFile ?? runningState?.envFile ?? undefined;

  if (runningState) {
    info(
      `正在重启热点服务（当前 PID ${runningState.pid}，端口 ${runningState.port}）...`,
    );
    const stopCode = await stopCommand(
      { ...options, command: 'stop', json: false },
      context,
    );
    // stop 失败（例如 PID 无法确认）时不要继续启动：
    // 否则会在 start 阶段抛出一个和真实原因无关的错误。
    if (stopCode !== EXIT_CODES.ok) {
      throw new CliError(
        `停止旧实例失败（退出码 ${stopCode}），已中止重启。` +
          `请根据上面的提示处理后重试，或执行 ${APP_NAME} stop --force`,
      );
    }
  } else {
    if (existing.state || existing.corrupt) {
      warn('清理了过期运行状态');
    }
    info('热点服务未在运行，将直接启动');
  }

  const startOptions: CliOptions = {
    ...options,
    command: 'start',
    commandExplicit: true,
    help: false,
    version: false,
    json: false,
    follow: false,
    lines: DEFAULT_LOG_LINES,
    daemon: mode === 'daemon',
    foreground: false,
    port,
    host,
    envFile,
    clear: false,
    helpTarget: undefined,
  };
  return startCommand(startOptions, context);
}
