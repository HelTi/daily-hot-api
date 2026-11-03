import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
  appendFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  clearLogFile,
  readLogChunk,
  rotateLogFile,
  tailFile,
} from './log-file';
import { CliError } from './errors';

describe('log-file', () => {
  const tempDirs: string[] = [];

  function makeLogFile(content = ''): string {
    const dir = mkdtempSync(join(tmpdir(), 'dha-log-'));
    tempDirs.push(dir);
    const file = join(dir, 'daily-hot-api.log');
    writeFileSync(file, content);
    return file;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('读取日志最后 N 行', () => {
    const file = makeLogFile('one\ntwo\nthree\nfour\nfive\n');
    expect(tailFile(file, 2)).toBe('four\nfive');
    expect(tailFile(file, 10)).toBe('one\ntwo\nthree\nfour\nfive');
    expect(tailFile(file, 0)).toBe('');
  });

  it('空文件返回空字符串', () => {
    expect(tailFile(makeLogFile(''), 10)).toBe('');
  });

  it('文件不存在时抛出 CliError', () => {
    expect(() => tailFile('/tmp/dha-missing-log-file.log', 10)).toThrow(
      CliError,
    );
  });

  it('从指定位置读取新增日志', () => {
    const file = makeLogFile('first\n');
    const size = 'first\n'.length;
    appendFileSync(file, 'second\n');

    const chunk = readLogChunk(file, size);
    expect(chunk.text).toBe('second\n');
    expect(chunk.truncated).toBe(false);
    expect(chunk.nextPosition).toBe(Buffer.byteLength('first\nsecond\n'));
  });

  it('文件被截断时从头读取并标记 truncated', () => {
    const file = makeLogFile('a long original log line\n');
    truncateSync(file, 0);
    writeFileSync(file, 'new\n');

    const chunk = readLogChunk(file, 1024);
    expect(chunk.truncated).toBe(true);
    expect(chunk.text).toBe('new\n');
    expect(chunk.nextPosition).toBe(4);
  });

  it('文件不存在时返回空 chunk', () => {
    const chunk = readLogChunk('/tmp/dha-missing-log-file.log', 10);
    expect(chunk.text).toBe('');
    expect(chunk.nextPosition).toBe(0);
  });

  it('超过上限时轮转日志并保留有限份数', () => {
    const file = makeLogFile('current\n');
    expect(rotateLogFile(file, 100)).toBe(false);

    writeFileSync(file, 'x'.repeat(200));
    expect(rotateLogFile(file, 100, 2)).toBe(true);
    expect(existsSync(file)).toBe(false);
    expect(statSync(`${file}.1`).size).toBe(200);

    writeFileSync(file, 'y'.repeat(200));
    expect(rotateLogFile(file, 100, 2)).toBe(true);
    expect(readFileSync(`${file}.1`, 'utf8')).toBe('y'.repeat(200));
    expect(readFileSync(`${file}.2`, 'utf8')).toBe('x'.repeat(200));

    writeFileSync(file, 'z'.repeat(200));
    expect(rotateLogFile(file, 100, 2)).toBe(true);
    // keep=2 时最旧的一份被丢弃。
    expect(existsSync(`${file}.3`)).toBe(false);
    expect(readFileSync(`${file}.2`, 'utf8')).toBe('y'.repeat(200));
  });

  it('日志不存在时轮转是空操作', () => {
    expect(rotateLogFile('/tmp/dha-missing-log-file.log', 1)).toBe(false);
  });

  it('clearLogFile 清空内容并保留文件', () => {
    const file = makeLogFile('something\n');
    clearLogFile(file);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBe(0);
    expect(() => clearLogFile('/tmp/dha-missing-log-file.log')).toThrow(
      CliError,
    );
  });
});
