import type { CommandName } from './args';
import { getPackageVersion } from './paths';

function versionOrUnknown(): string {
  return getPackageVersion();
}

const START_HELP = `用法: daily-hot-api [start] [选项]

在前台启动热点服务（默认命令）。服务日志直接输出到当前终端，
按 Ctrl+C 停止；也可以在其他终端执行 daily-hot-api stop。

选项:
  -p, --port <端口>      覆盖监听端口（默认取 .env 的 PORT，否则 6689）
  -d, --daemon           在后台启动，日志写入状态目录
      --config <路径>    指定 .env 配置文件（默认顺序: DAILY_HOT_API_ENV_FILE → 当前目录 .env → 状态目录 .env）
      --home <目录>      指定状态目录（默认 ~/.daily-hot-api）
  -h, --help             查看帮助

示例:
  daily-hot-api                    前台启动
  daily-hot-api -p 6699            前台启动并指定端口
  daily-hot-api start -d           后台启动
  daily-hot-api start -d --port 6699 --config ./prod.env`;

const STOP_HELP = `用法: daily-hot-api stop [选项]

停止由 CLI 启动的热点服务。先发送 SIGTERM 优雅退出，
超过 --timeout 仍未退出则发送 SIGKILL。

选项:
      --timeout <秒>     等待进程退出的超时时间（默认 10 秒）
      --force            跳过进程校验并立即 SIGKILL
      --json             以 JSON 输出结果
      --home <目录>      指定状态目录（默认 ~/.daily-hot-api）
  -h, --help             查看帮助

退出码:
  0  已停止（或本来未在运行，幂等）
  1  停止失败`;

const STATUS_HELP = `用法: daily-hot-api status [选项]

查看由 CLI 启动的热点服务状态，包括 PID、端口、运行时长和健康检查。

选项:
      --json             以 JSON 输出结果
      --home <目录>      指定状态目录（默认 ~/.daily-hot-api）
  -h, --help             查看帮助

退出码:
  0  运行中
  3  未运行`;

const RESTART_HELP = `用法: daily-hot-api restart [选项]

重启由 CLI 启动的热点服务。默认沿用上一次的端口、配置文件和运行模式；
服务未在运行时等同于 start。

选项:
  -d, --daemon           重启后在后台运行
      --foreground       重启后在前台运行
  -p, --port <端口>      覆盖监听端口
      --config <路径>    指定 .env 配置文件
      --timeout <秒>     等待旧进程退出的超时时间（默认 10 秒）
      --force            停止旧进程时立即 SIGKILL
      --home <目录>      指定状态目录（默认 ~/.daily-hot-api）
  -h, --help             查看帮助

示例:
  daily-hot-api restart
  daily-hot-api restart -d
  daily-hot-api restart --foreground -p 6699`;

const LOGS_HELP = `用法: daily-hot-api logs [选项]

查看后台服务日志。前台模式的标准输出直接打印在启动终端，
不会写入日志文件。

选项:
  -n, --lines <行数>     显示最后 N 行（默认 50）
  -f, --follow           持续跟踪新增日志，按 Ctrl+C 退出
      --home <目录>      指定状态目录（默认 ~/.daily-hot-api）
  -h, --help             查看帮助

示例:
  daily-hot-api logs
  daily-hot-api logs -n 200
  daily-hot-api logs -f`;

const HELP_HELP = `用法: daily-hot-api help [命令]

显示全局帮助或指定命令的帮助。

示例:
  daily-hot-api help
  daily-hot-api help start`;

const VERSION_HELP = `用法: daily-hot-api --version

打印当前 CLI 版本。`;

const COMMAND_HELP: Record<CommandName, string> = {
  start: START_HELP,
  stop: STOP_HELP,
  status: STATUS_HELP,
  restart: RESTART_HELP,
  logs: LOGS_HELP,
  help: HELP_HELP,
  version: VERSION_HELP,
};

export function globalHelp(): string {
  return `daily-hot-api v${versionOrUnknown()}

每日热榜聚合 API 服务命令行工具：在前台或后台启动热点服务，并管理其生命周期。

用法:
  daily-hot-api [start] [选项]      在前台启动热点服务（默认命令）
  daily-hot-api start -d [选项]     在后台启动热点服务
  daily-hot-api stop [选项]         停止由 CLI 启动的热点服务
  daily-hot-api restart [选项]      重启热点服务
  daily-hot-api status [选项]       查看服务状态（未运行时退出码 3）
  daily-hot-api logs [选项]         查看或跟踪后台服务日志
  daily-hot-api help [命令]         查看命令帮助
  daily-hot-api --version           查看版本

常用选项:
  -p, --port <端口>        覆盖监听端口（默认取 .env 的 PORT，否则 6689）
  -d, --daemon             在后台运行（start/restart）
      --foreground         在前台运行（restart 用来覆盖原模式）
      --config <路径>      指定 .env 配置文件
      --home <目录>        指定状态目录（默认 ~/.daily-hot-api）
      --timeout <秒>       stop/restart 等待退出的超时时间（默认 10 秒）
      --force              强制结束进程（SIGKILL，stop/restart）
      --json               以 JSON 输出（status/stop）
  -n, --lines <行数>       logs 显示的行数（默认 50）
  -f, --follow             logs 持续跟踪新增日志
  -h, --help               查看帮助
  -v, --version            查看版本

示例:
  daily-hot-api                         前台启动，默认端口 6689
  daily-hot-api -p 6699                 前台启动并指定端口
  daily-hot-api start -d                后台启动
  daily-hot-api status                  查看状态
  daily-hot-api logs -f                 跟踪后台日志
  daily-hot-api stop                    停止服务
  npx daily-hot-api start -d            不全局安装，直接用 npx 后台启动

环境变量:
  PORT                    服务端口
  DAILY_HOT_API_HOME      状态目录，默认 ~/.daily-hot-api
  DAILY_HOT_API_ENV_FILE  显式指定 .env 文件（等同于 --config）

首次使用: 在运行目录准备 .env（可复制 .env.example），或使用 --config 指定。
文档: https://helti.github.io/daily-hot-api/guide/cli`;
}

export function commandHelp(command: CommandName): string {
  if (command === 'version') {
    return `daily-hot-api v${versionOrUnknown()}\n\n${VERSION_HELP}`;
  }
  return COMMAND_HELP[command];
}
