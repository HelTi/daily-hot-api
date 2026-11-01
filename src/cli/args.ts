import { UsageError } from './errors';
import { DEFAULT_STOP_TIMEOUT_SECONDS } from './paths';

export type CommandName =
  | 'start'
  | 'stop'
  | 'status'
  | 'restart'
  | 'logs'
  | 'help'
  | 'version';

export type OptionKey =
  | 'help'
  | 'version'
  | 'json'
  | 'daemon'
  | 'foreground'
  | 'port'
  | 'envFile'
  | 'home'
  | 'timeout'
  | 'force'
  | 'follow'
  | 'lines';

export const COMMAND_NAMES: readonly CommandName[] = [
  'start',
  'stop',
  'status',
  'restart',
  'logs',
  'help',
  'version',
];

export interface CliOptions {
  command: CommandName;
  /** 是否在命令行里显式写了命令名；用于区分 `--help` 与 `start --help`。 */
  commandExplicit: boolean;
  help: boolean;
  version: boolean;
  json: boolean;
  daemon: boolean;
  foreground: boolean;
  port?: number;
  envFile?: string;
  home?: string;
  /** stop/restart 等待进程退出的超时时间，单位秒。 */
  timeoutSeconds: number;
  force: boolean;
  follow: boolean;
  lines: number;
  helpTarget?: CommandName;
}

export const DEFAULT_LOG_LINES = 50;

const FLAG_MAP: Record<string, OptionKey> = {
  '-h': 'help',
  '--help': 'help',
  '-v': 'version',
  '--version': 'version',
  '--json': 'json',
  '-d': 'daemon',
  '--daemon': 'daemon',
  '--foreground': 'foreground',
  '-p': 'port',
  '--port': 'port',
  '--config': 'envFile',
  // 兼容写法；注意 Node 24 自身也会解析 --env-file（即使出现在脚本之后），
  // 文件不存在时会被 Node 提前拦截，所以文档和帮助统一推荐 --config。
  '--env-file': 'envFile',
  '--home': 'home',
  '--timeout': 'timeout',
  '--force': 'force',
  '-f': 'follow',
  '--follow': 'follow',
  '-n': 'lines',
  '--lines': 'lines',
};

const FLAG_DISPLAY: Record<OptionKey, string> = {
  help: '--help',
  version: '--version',
  json: '--json',
  daemon: '--daemon',
  foreground: '--foreground',
  port: '--port',
  envFile: '--config',
  home: '--home',
  timeout: '--timeout',
  force: '--force',
  follow: '--follow',
  lines: '--lines',
};

const VALUE_OPTIONS: ReadonlySet<OptionKey> = new Set<OptionKey>([
  'port',
  'envFile',
  'home',
  'timeout',
  'lines',
]);

/** 每个命令允许的选项；help/version 由全局流程提前处理。 */
const COMMAND_OPTIONS: Record<CommandName, readonly OptionKey[]> = {
  start: ['help', 'daemon', 'port', 'envFile', 'home'],
  stop: ['help', 'json', 'timeout', 'force', 'home'],
  status: ['help', 'json', 'home'],
  restart: [
    'help',
    'daemon',
    'foreground',
    'port',
    'envFile',
    'home',
    'timeout',
    'force',
  ],
  logs: ['help', 'follow', 'lines', 'home'],
  help: ['help'],
  version: [],
};

export function isCommandName(value: string): value is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(value);
}

function parseNumberOption(key: OptionKey, raw: string): number {
  switch (key) {
    case 'port': {
      if (!/^\d+$/.test(raw)) {
        throw new UsageError(`--port 必须是 1-65535 的整数，收到: ${raw}`);
      }
      const port = Number(raw);
      if (port < 1 || port > 65535) {
        throw new UsageError(`--port 必须是 1-65535 的整数，收到: ${raw}`);
      }
      return port;
    }
    case 'timeout': {
      const seconds = Number(raw);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new UsageError(`--timeout 必须是大于 0 的秒数，收到: ${raw}`);
      }
      return seconds;
    }
    case 'lines': {
      if (!/^\d+$/.test(raw) || Number(raw) < 0) {
        throw new UsageError(`--lines 必须是大于等于 0 的整数，收到: ${raw}`);
      }
      return Number(raw);
    }
    default:
      throw new UsageError(`选项 ${FLAG_DISPLAY[key]} 不是数字选项`);
  }
}

export function parseArgs(argv: string[]): CliOptions {
  let command: CommandName | undefined;
  let commandExplicit = false;
  let helpTarget: CommandName | undefined;

  const flags = {
    help: false,
    version: false,
    json: false,
    daemon: false,
    foreground: false,
    force: false,
    follow: false,
  };
  let port: number | undefined;
  let envFile: string | undefined;
  let home: string | undefined;
  let timeoutSeconds = DEFAULT_STOP_TIMEOUT_SECONDS;
  let lines = DEFAULT_LOG_LINES;
  const seen = new Set<OptionKey>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token.startsWith('-') && token.length > 1) {
      const equalsIndex = token.indexOf('=');
      const flagName = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
      const inlineValue =
        equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined;
      const key = FLAG_MAP[flagName];
      if (!key) {
        throw new UsageError(`未知选项: ${flagName}`);
      }

      seen.add(key);

      if (VALUE_OPTIONS.has(key)) {
        const raw = inlineValue ?? argv[index + 1];
        if (inlineValue === undefined) {
          index += 1;
        }
        if (raw === undefined || raw === '') {
          throw new UsageError(`选项 ${flagName} 需要一个值`);
        }
        if (key === 'port') {
          port = parseNumberOption(key, raw);
        } else if (key === 'timeout') {
          timeoutSeconds = parseNumberOption(key, raw);
        } else if (key === 'lines') {
          lines = parseNumberOption(key, raw);
        } else if (key === 'home') {
          home = raw;
        } else {
          envFile = raw;
        }
        continue;
      }

      if (inlineValue !== undefined) {
        throw new UsageError(`选项 ${flagName} 不接受值`);
      }

      switch (key) {
        case 'help':
          flags.help = true;
          break;
        case 'version':
          flags.version = true;
          break;
        case 'json':
          flags.json = true;
          break;
        case 'daemon':
          flags.daemon = true;
          break;
        case 'foreground':
          flags.foreground = true;
          break;
        case 'force':
          flags.force = true;
          break;
        case 'follow':
          flags.follow = true;
          break;
        default:
          throw new UsageError(`未知选项: ${flagName}`);
      }
      continue;
    }

    if (!command) {
      if (!isCommandName(token)) {
        throw new UsageError(
          `未知命令: ${token}\n运行 daily-hot-api --help 查看可用命令`,
        );
      }
      command = token;
      commandExplicit = true;
      continue;
    }

    if (command === 'help' && !helpTarget) {
      if (!isCommandName(token)) {
        throw new UsageError(`未知命令: ${token}`);
      }
      helpTarget = token;
      continue;
    }

    throw new UsageError(`多余的参数: ${token}`);
  }

  // 版本优先级最高，`daily-hot-api start --version` 也直接打印版本。
  if (flags.version) {
    return {
      command: 'version',
      commandExplicit: true,
      help: false,
      version: true,
      json: false,
      daemon: false,
      foreground: false,
      timeoutSeconds: DEFAULT_STOP_TIMEOUT_SECONDS,
      force: false,
      follow: false,
      lines: DEFAULT_LOG_LINES,
    };
  }

  const effectiveCommand: CommandName = command ?? 'start';

  if (flags.daemon && flags.foreground) {
    throw new UsageError('--daemon 与 --foreground 不能同时使用');
  }

  // 帮助信息不校验命令与选项的兼容性，`start --help --json` 也展示帮助。
  if (!flags.help) {
    const supported = COMMAND_OPTIONS[effectiveCommand];
    for (const key of seen) {
      if (!supported.includes(key)) {
        throw new UsageError(
          `命令 ${effectiveCommand} 不支持选项 ${FLAG_DISPLAY[key]}`,
        );
      }
    }
  }

  return {
    command: effectiveCommand,
    commandExplicit,
    help: flags.help,
    version: false,
    json: flags.json,
    daemon: flags.daemon,
    foreground: flags.foreground,
    port,
    envFile,
    home,
    timeoutSeconds,
    force: flags.force,
    follow: flags.follow,
    lines,
    helpTarget,
  };
}

/** 仅供帮助文本和测试使用：某个命令支持的选项展示名。 */
export function supportedOptions(command: CommandName): string[] {
  return COMMAND_OPTIONS[command].map((key) => FLAG_DISPLAY[key]);
}
