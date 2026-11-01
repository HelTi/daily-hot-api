import { parseArgs, supportedOptions } from './args';
import { UsageError } from './errors';
import { DEFAULT_STOP_TIMEOUT_SECONDS } from './paths';

describe('parseArgs', () => {
  it('无参数时默认在前台启动', () => {
    const options = parseArgs([]);
    expect(options.command).toBe('start');
    expect(options.commandExplicit).toBe(false);
    expect(options.daemon).toBe(false);
    expect(options.port).toBeUndefined();
    expect(options.timeoutSeconds).toBe(DEFAULT_STOP_TIMEOUT_SECONDS);
    expect(options.lines).toBe(50);
  });

  it('裸参数按 start 处理，支持守护进程和端口', () => {
    const options = parseArgs(['-d', '-p', '6699']);
    expect(options.command).toBe('start');
    expect(options.commandExplicit).toBe(false);
    expect(options.daemon).toBe(true);
    expect(options.port).toBe(6699);
  });

  it('支持 --选项=值 的内联写法', () => {
    const options = parseArgs(['start', '--port=6789', '--config=./prod.env']);
    expect(options.port).toBe(6789);
    expect(options.envFile).toBe('./prod.env');
  });

  it('解析 stop 的超时、强制和 JSON 选项', () => {
    const options = parseArgs(['stop', '--timeout', '5', '--force', '--json']);
    expect(options.command).toBe('stop');
    expect(options.timeoutSeconds).toBe(5);
    expect(options.force).toBe(true);
    expect(options.json).toBe(true);
  });

  it('解析 restart 的模式选项', () => {
    const options = parseArgs(['restart', '--foreground', '-p', '7000']);
    expect(options.command).toBe('restart');
    expect(options.foreground).toBe(true);
    expect(options.daemon).toBe(false);
    expect(options.port).toBe(7000);
  });

  it('解析 logs 的行数和跟踪选项', () => {
    const options = parseArgs(['logs', '-n', '120', '-f']);
    expect(options.command).toBe('logs');
    expect(options.lines).toBe(120);
    expect(options.follow).toBe(true);
  });

  it('解析 help 子命令目标', () => {
    const options = parseArgs(['help', 'stop']);
    expect(options.command).toBe('help');
    expect(options.helpTarget).toBe('stop');
  });

  it('--help 标记全局帮助', () => {
    const options = parseArgs(['--help']);
    expect(options.help).toBe(true);
    expect(options.commandExplicit).toBe(false);
  });

  it('start --help 保留显式命令', () => {
    const options = parseArgs(['start', '--help']);
    expect(options.help).toBe(true);
    expect(options.commandExplicit).toBe(true);
    expect(options.command).toBe('start');
  });

  it('--version 优先级最高', () => {
    const options = parseArgs(['start', '--version']);
    expect(options.command).toBe('version');
    expect(options.version).toBe(true);
  });

  it('未知命令和未知选项抛出用法错误', () => {
    expect(() => parseArgs(['unknown'])).toThrow(UsageError);
    expect(() => parseArgs(['--unknown'])).toThrow(UsageError);
  });

  it('命令不支持的选项抛出用法错误', () => {
    expect(() => parseArgs(['stop', '--daemon'])).toThrow(UsageError);
    expect(() => parseArgs(['start', '--json'])).toThrow(UsageError);
    expect(() => parseArgs(['logs', '--port', '6699'])).toThrow(UsageError);
  });

  it('--daemon 与 --foreground 冲突', () => {
    expect(() => parseArgs(['restart', '-d', '--foreground'])).toThrow(
      UsageError,
    );
  });

  it('端口必须是 1-65535 的整数', () => {
    expect(() => parseArgs(['--port', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', '65536'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', 'abc'])).toThrow(UsageError);
    expect(parseArgs(['--port', '65535']).port).toBe(65535);
  });

  it('选项缺少值时报错', () => {
    expect(() => parseArgs(['--port'])).toThrow(UsageError);
    expect(() => parseArgs(['--timeout'])).toThrow(UsageError);
  });

  it('多余的位置参数报错', () => {
    expect(() => parseArgs(['start', 'extra'])).toThrow(UsageError);
  });

  it('帮助文本列出命令支持的选项', () => {
    expect(supportedOptions('start')).toContain('--daemon');
    expect(supportedOptions('stop')).toContain('--timeout');
    expect(supportedOptions('status')).toContain('--json');
  });
});
