import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import {
  buildCliPaths,
  getBinPath,
  getPackageRoot,
  resolveEnvFile,
  resolveHomeDir,
} from './paths';

describe('paths', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dha-paths-'));
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

  it('包根目录包含 package.json，bin 路径指向 CLI 入口', () => {
    const root = getPackageRoot();
    expect(existsSync(join(root, 'package.json'))).toBe(true);
    const packageJson = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as { name: string; bin: Record<string, string> };
    expect(packageJson.name).toBe('@ttkit/daily-hot-api');
    expect(getBinPath()).toBe(join(root, packageJson.bin['daily-hot-api']));
  });

  it('默认状态目录为 ~/.daily-hot-api', () => {
    expect(resolveHomeDir({ cwd: '/tmp', env: {} })).toBe(
      join(homedir(), '.daily-hot-api'),
    );
  });

  it('--home 相对路径基于 cwd 解析', () => {
    expect(resolveHomeDir({ home: '.state', cwd: '/tmp/app', env: {} })).toBe(
      '/tmp/app/.state',
    );
  });

  it('DAILY_HOT_API_HOME 可作为状态目录', () => {
    expect(
      resolveHomeDir({
        cwd: '/tmp/app',
        env: { DAILY_HOT_API_HOME: '/var/lib/daily-hot-api' },
      }),
    ).toBe('/var/lib/daily-hot-api');
  });

  it('状态目录下包含状态文件和日志文件', () => {
    const paths = buildCliPaths('/tmp/dha-home');
    expect(paths.stateFile).toBe('/tmp/dha-home/daily-hot-api.json');
    expect(paths.logFile).toBe('/tmp/dha-home/logs/daily-hot-api.log');
  });

  it('配置文件优先使用显式路径，其次 cwd/.env，再次 home/.env', () => {
    const cwd = makeTempDir();
    const homeDir = makeTempDir();
    const explicit = join(makeTempDir(), 'custom.env');
    writeFileSync(explicit, 'FOO=1\n');

    expect(
      resolveEnvFile({ cwd, homeDir, envFile: explicit, env: {} }),
    ).toEqual({ path: explicit, explicit: true });

    const cwdEnv = join(cwd, '.env');
    writeFileSync(cwdEnv, 'FOO=1\n');
    expect(resolveEnvFile({ cwd, homeDir, env: {} })).toEqual({
      path: cwdEnv,
      explicit: false,
    });

    rmSync(cwdEnv);
    const homeEnv = join(homeDir, '.env');
    writeFileSync(homeEnv, 'FOO=2\n');
    expect(resolveEnvFile({ cwd, homeDir, env: {} })).toEqual({
      path: homeEnv,
      explicit: false,
    });
  });

  it('显式指定的配置文件即使不存在也会返回，交由调用方报错', () => {
    const cwd = makeTempDir();
    const missing = join(cwd, 'missing.env');
    expect(
      resolveEnvFile({
        cwd,
        homeDir: makeTempDir(),
        envFile: missing,
        env: {},
      }),
    ).toEqual({ path: missing, explicit: true });
  });

  it('没有配置文件时返回 undefined', () => {
    expect(
      resolveEnvFile({ cwd: makeTempDir(), homeDir: makeTempDir(), env: {} }),
    ).toBeUndefined();
  });

  it('存在 home 的 .env 时也能找到', () => {
    const cwd = makeTempDir();
    const homeDir = makeTempDir();
    mkdirSync(join(homeDir, 'nested'), { recursive: true });
    writeFileSync(join(homeDir, '.env'), 'A=1\n');
    const resolved = resolveEnvFile({ cwd, homeDir, env: {} });
    expect(resolved?.path).toBe(join(homeDir, '.env'));
  });
});
