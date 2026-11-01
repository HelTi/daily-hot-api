import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import type { CliOptions } from '../args';
import type { CommandContext } from '../context';
import { EXIT_CODES } from '../errors';
import { readLogChunk, tailFile } from '../log-file';
import { fail, progress } from '../output';
import { buildCliPaths, resolveHomeDir } from '../paths';

const FOLLOW_INTERVAL_MS = 500;

export async function logsCommand(
  options: CliOptions,
  context: Partial<CommandContext> = {},
): Promise<number> {
  const cwd = context.cwd ?? process.cwd();
  const env = context.env ?? process.env;
  const homeDir = resolveHomeDir({ home: options.home, cwd, env });
  const paths = buildCliPaths(homeDir);

  if (!existsSync(paths.logFile)) {
    fail(`日志文件不存在: ${paths.logFile}`);
    fail(
      '前台模式的标准输出直接打印在启动终端，不会写入日志文件；请使用 daily-hot-api start -d 后台启动',
    );
    return EXIT_CODES.error;
  }

  const content = tailFile(paths.logFile, options.lines);
  if (content) {
    process.stdout.write(content.endsWith('\n') ? content : `${content}\n`);
  }

  if (!options.follow) {
    return EXIT_CODES.ok;
  }

  progress(`正在跟踪日志: ${paths.logFile}（按 Ctrl+C 退出）`);
  let position = (await stat(paths.logFile)).size;

  const timer = setInterval(() => {
    try {
      const chunk = readLogChunk(paths.logFile, position);
      position = chunk.nextPosition;
      if (chunk.text) {
        process.stdout.write(chunk.text);
      }
    } catch {
      // 日志文件暂时不可读（例如正在轮转）时继续等待下一轮。
    }
  }, FOLLOW_INTERVAL_MS);

  const stopFollowing = (): void => {
    clearInterval(timer);
  };
  process.once('SIGINT', () => {
    stopFollowing();
    process.stdout.write('\n');
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    stopFollowing();
    process.exit(0);
  });

  return EXIT_CODES.ok;
}
