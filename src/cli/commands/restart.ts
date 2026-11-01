import { DEFAULT_LOG_LINES, type CliOptions } from '../args';
import type { CommandContext } from '../context';
import { CliError } from '../errors';
import { info, warn } from '../output';
import {
  APP_NAME,
  buildCliPaths,
  getPackageRoot,
  resolveHomeDir,
} from '../paths';
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
    !processLooksLikeService(existing.state.pid, getPackageRoot())
  ) {
    throw new CliError(
      `运行状态文件记录的 PID ${existing.state.pid} 仍存活，但无法确认是 ${APP_NAME} 进程。` +
        `请先执行 ${APP_NAME} stop --force 终止并清理状态文件，或手动删除 ${paths.stateFile}`,
    );
  }

  const runningState =
    existing.state &&
    isProcessAlive(existing.state.pid) &&
    processLooksLikeService(existing.state.pid, getPackageRoot())
      ? existing.state
      : null;

  // 默认沿用上一次的端口、配置文件和运行模式。
  const mode: RunMode = options.daemon
    ? 'daemon'
    : options.foreground
      ? 'foreground'
      : (runningState?.mode ?? 'foreground');
  const port = options.port ?? runningState?.port;
  const envFile = options.envFile ?? runningState?.envFile ?? undefined;

  if (runningState) {
    info(
      `正在重启热点服务（当前 PID ${runningState.pid}，端口 ${runningState.port}）...`,
    );
    await stopCommand({ ...options, command: 'stop', json: false }, context);
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
    envFile,
    helpTarget: undefined,
  };
  return startCommand(startOptions, context);
}
