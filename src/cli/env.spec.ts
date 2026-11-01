import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { applyEnvFile, resolvePort } from './env';
import { CliError } from './errors';
import { DEFAULT_PORT } from './paths';

describe('env', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dha-env-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('把 .env 内容合并进 env，不覆盖已有变量', () => {
    const dir = makeTempDir();
    const envFile = join(dir, '.env');
    writeFileSync(
      envFile,
      [
        '# 注释',
        'FOO=bar',
        'QUOTED="a b"',
        'EXISTING=from-file',
        'EMPTY=',
        '',
      ].join('\n'),
    );

    const env: NodeJS.ProcessEnv = { EXISTING: 'from-process' };
    const applied = applyEnvFile(envFile, env);

    expect(env.FOO).toBe('bar');
    expect(env.QUOTED).toBe('a b');
    expect(env.EXISTING).toBe('from-process');
    expect(env.EMPTY).toBe('');
    expect(applied).toEqual(['FOO', 'QUOTED', 'EMPTY']);
  });

  it('配置文件不存在时抛出 CliError', () => {
    expect(() => applyEnvFile('/tmp/dha-missing.env', {})).toThrow(CliError);
  });

  it('端口优先级：参数 > 环境变量 > 默认值', () => {
    expect(resolvePort(undefined, {})).toBe(DEFAULT_PORT);
    expect(resolvePort(undefined, { PORT: '7000' })).toBe(7000);
    expect(resolvePort(7001, { PORT: '7000' })).toBe(7001);
  });

  it('非法 PORT 抛出 CliError', () => {
    expect(() => resolvePort(undefined, { PORT: 'abc' })).toThrow(CliError);
    expect(() => resolvePort(undefined, { PORT: '0' })).toThrow(CliError);
    expect(() => resolvePort(undefined, { PORT: '65536' })).toThrow(CliError);
  });
});
