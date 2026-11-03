import type { CliOptions } from '../args';
import type { CommandContext } from '../context';
import { EXIT_CODES } from '../errors';
import { checkHealth } from '../health';
import { field, formatDuration, info } from '../output';
import { buildCliPaths, resolveHomeDir, type CliPaths } from '../paths';
import {
  clearRunState,
  isProcessAlive,
  probeHost,
  processLooksLikeService,
  readRunState,
} from '../run-state';

export async function statusCommand(
  options: CliOptions,
  context: Partial<CommandContext> = {},
): Promise<number> {
  const cwd = context.cwd ?? process.cwd();
  const env = context.env ?? process.env;
  const homeDir = resolveHomeDir({ home: options.home, cwd, env });
  const paths = buildCliPaths(homeDir);
  const existing = readRunState(paths.stateFile);

  if (existing.corrupt) {
    clearRunState(paths.stateFile);
    return reportNotRunning(options.json, '运行状态文件损坏，已清理', paths);
  }

  const state = existing.state;
  if (!state) {
    return reportNotRunning(options.json, '未找到运行状态', paths);
  }

  if (!isProcessAlive(state.pid)) {
    clearRunState(paths.stateFile, state.pid);
    return reportNotRunning(
      options.json,
      `PID ${state.pid} 已退出，已清理过期状态文件`,
      paths,
    );
  }

  if (!processLooksLikeService(state.pid, { entry: state.entry })) {
    // PID 仍存活但不属于本服务：保留状态文件，允许用户用 `stop --force` 处理。
    return reportNotRunning(
      options.json,
      `PID ${state.pid} 仍存活但无法确认是 daily-hot-api 进程，状态文件可能已过期；可执行 daily-hot-api stop --force 清理`,
      paths,
    );
  }

  const health = await checkHealth(state.port, 2000, state.host);
  const startedAtMs = Date.parse(state.startedAt);
  const uptimeSeconds = Number.isFinite(startedAtMs)
    ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
    : 0;
  const url = `http://${probeHost(state.host)}:${state.port}`;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          running: true,
          pid: state.pid,
          port: state.port,
          host: state.host || '0.0.0.0',
          url,
          mode: state.mode,
          startedAt: state.startedAt,
          uptimeSeconds,
          health,
          cwd: state.cwd,
          envFile: state.envFile,
          logFile: state.logFile,
          version: state.version,
        },
        null,
        2,
      ),
    );
    return EXIT_CODES.ok;
  }

  info('热点服务运行中');
  field('PID', state.pid);
  field('监听', `${state.host || '0.0.0.0'}:${state.port}`);
  field('地址', url);
  field(
    '模式',
    state.mode === 'daemon' ? '后台 (daemon)' : '前台 (foreground)',
  );
  field(
    '启动时间',
    `${state.startedAt}（已运行 ${formatDuration(uptimeSeconds)}）`,
  );
  field('健康检查', health ? 'ok' : '无响应（进程存在但 /health 不可达）');
  if (state.envFile) {
    field('配置文件', state.envFile);
  }
  field('运行目录', state.cwd || 'unknown');
  if (state.logFile) {
    field('日志文件', state.logFile);
  }
  return EXIT_CODES.ok;
}

function reportNotRunning(
  json: boolean,
  reason: string,
  paths: CliPaths,
): number {
  if (json) {
    console.log(
      JSON.stringify({ running: false, reason, stateFile: paths.stateFile }),
    );
  } else {
    info(`热点服务未在运行（${reason}）`);
  }
  return EXIT_CODES.notRunning;
}
