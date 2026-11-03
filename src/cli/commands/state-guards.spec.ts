import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseArgs } from '../args';
import { processLooksLikeService, type RunState } from '../run-state';
import { stopCommand } from './stop';
import { statusCommand } from './status';

jest.mock('../run-state', () => {
  const actual: typeof import('../run-state') =
    jest.requireActual('../run-state');
  return {
    ...actual,
    processLooksLikeService: jest.fn(),
  };
});

const mockedLooksLikeService = processLooksLikeService as jest.MockedFunction<
  typeof processLooksLikeService
>;

function makeState(port = 7000): RunState {
  return {
    pid: process.pid,
    port,
    host: '127.0.0.1',
    mode: 'daemon',
    startedAt: new Date().toISOString(),
    cwd: '/tmp',
    envFile: null,
    logFile: null,
    version: '0.1.0',
    entry: '/tmp/daily-hot-api/bin/daily-hot-api.js',
  };
}

describe('CLI state guards (unverifiable live PID)', () => {
  let homeDir: string;
  let stateFile: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'dha-guard-'));
    stateFile = join(homeDir, 'daily-hot-api.json');
    writeFileSync(stateFile, JSON.stringify(makeState()));
    mockedLooksLikeService.mockReset();
    mockedLooksLikeService.mockReturnValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('stop 不向无法确认的存活 PID 发信号，保留状态文件并返回 1', async () => {
    const options = parseArgs(['stop', '--home', homeDir]);
    const code = await stopCommand(options, { cwd: homeDir, env: {} });

    expect(code).toBe(1);
    expect(existsSync(stateFile)).toBe(true);
  });

  it('status 对无法确认的存活 PID 返回 3，且保留状态文件以便 stop --force', async () => {
    const options = parseArgs(['status', '--json', '--home', homeDir]);
    const code = await statusCommand(options, { cwd: homeDir, env: {} });

    expect(code).toBe(3);
    expect(existsSync(stateFile)).toBe(true);
  });

  it('确认属于本服务时 status 正常返回运行状态', async () => {
    mockedLooksLikeService.mockReturnValue(true);
    const options = parseArgs(['status', '--json', '--home', homeDir]);
    const code = await statusCommand(options, { cwd: homeDir, env: {} });

    expect(code).toBe(0);
    expect(mockedLooksLikeService).toHaveBeenCalled();
  });
});
