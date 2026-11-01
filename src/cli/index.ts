import { parseArgs, type CliOptions, type CommandName } from './args';
import { logsCommand } from './commands/logs';
import { restartCommand } from './commands/restart';
import { startCommand } from './commands/start';
import { statusCommand } from './commands/status';
import { stopCommand } from './commands/stop';
import { CliError, EXIT_CODES, UsageError } from './errors';
import { commandHelp, globalHelp } from './help';
import { getPackageVersion } from './paths';

export async function run(argv: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`错误: ${error.message}`);
      console.error('');
      console.error(globalHelp());
      return EXIT_CODES.usage;
    }
    throw error;
  }

  if (options.version || options.command === 'version') {
    console.log(getPackageVersion());
    return EXIT_CODES.ok;
  }

  if (options.help || options.command === 'help') {
    printHelp(options);
    return EXIT_CODES.ok;
  }

  switch (options.command) {
    case 'start':
      return startCommand(options);
    case 'stop':
      return stopCommand(options);
    case 'status':
      return statusCommand(options);
    case 'restart':
      return restartCommand(options);
    case 'logs':
      return logsCommand(options);
    default: {
      const exhaustive: never = options.command;
      throw new UsageError(`未知命令: ${String(exhaustive)}`);
    }
  }
}

function printHelp(options: CliOptions): void {
  let target: CommandName | undefined;
  if (options.command === 'help') {
    target = options.helpTarget;
  } else if (options.commandExplicit) {
    target = options.command;
  }

  if (!target || target === 'help') {
    console.log(globalHelp());
  } else {
    console.log(commandHelp(target));
  }
}

/**
 * CLI 进程入口。bin/daily-hot-api.js 会 require 本文件并调用 main()。
 */
export function main(argv: string[] = process.argv.slice(2)): void {
  run(argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      let exitCode: number = EXIT_CODES.error;
      if (error instanceof CliError) {
        console.error(`错误: ${error.message}`);
        exitCode = error.exitCode;
      } else {
        console.error(
          '错误:',
          error instanceof Error ? error.message : String(error),
        );
        if (
          process.env.DAILY_HOT_API_DEBUG &&
          error instanceof Error &&
          error.stack
        ) {
          console.error(error.stack);
        }
      }
      process.exitCode = exitCode;
      // 命令失败时确保进程不会因为残留句柄挂住（例如监听成功后初始化失败）。
      // 用 unref 定时器：正常无句柄时进程会自然退出，不会延迟成功路径。
      setTimeout(() => process.exit(exitCode), 100).unref();
    });
}

if (require.main === module) {
  main();
}
