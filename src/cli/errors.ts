export const EXIT_CODES = {
  /** 命令执行成功 */
  ok: 0,
  /** 运行错误（启动失败、配置错误等） */
  error: 1,
  /** 参数或用法错误 */
  usage: 2,
  /** status 专用：服务未在运行 */
  notRunning: 3,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class CliError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = EXIT_CODES.error) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CODES.usage);
    this.name = 'UsageError';
  }
}
