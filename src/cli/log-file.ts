import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  truncateSync,
} from 'fs';
import { CliError } from './errors';

export const LOG_TAIL_MAX_BYTES = 256 * 1024;

/** 单个日志文件的大小上限，超过后在下一次后台启动时轮转。 */
export const LOG_MAX_BYTES = 10 * 1024 * 1024;

/** 保留的历史日志份数（daily-hot-api.log.1 … .N）。 */
export const LOG_KEEP_FILES = 3;

/** 读取文件最后 N 行；文件很大时只读取尾部一段，避免一次性载入整个日志。 */
export function tailFile(
  file: string,
  lines: number,
  maxBytes = LOG_TAIL_MAX_BYTES,
): string {
  if (!existsSync(file)) {
    throw new CliError(`日志文件不存在: ${file}`);
  }
  const size = statSync(file).size;
  if (size === 0 || lines <= 0) {
    return '';
  }
  const start = Math.max(0, size - maxBytes);
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(size - start);
    // readSync 允许短读，日志也可能在 stat 之后被截断；只使用真正读到的字节，
    // 否则 Buffer 尾部的零字节会被当成内容打印出来。
    const bytesRead = readSync(fd, buffer, 0, buffer.length, start);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    if (start > 0) {
      // 丢掉可能被截断的第一行，保证输出从完整行开始。
      const firstNewline = text.indexOf('\n');
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';
    }
    text = text.replace(/\r?\n$/, '');
    if (!text) {
      return '';
    }
    const allLines = text.split(/\r?\n/);
    return allLines.slice(Math.max(0, allLines.length - lines)).join('\n');
  } finally {
    closeSync(fd);
  }
}

export interface LogChunk {
  text: string;
  nextPosition: number;
  /** 文件被截断或轮转，调用方应基于 nextPosition 重新跟进。 */
  truncated: boolean;
}

/** 从指定位置读取日志新增内容，供 logs --follow 使用。 */
export function readLogChunk(file: string, fromPosition: number): LogChunk {
  if (!existsSync(file)) {
    return { text: '', nextPosition: 0, truncated: fromPosition > 0 };
  }
  const size = statSync(file).size;
  const truncated = size < fromPosition;
  const start = truncated ? 0 : fromPosition;
  if (size <= start) {
    return { text: '', nextPosition: start, truncated };
  }
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(size - start);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, start);
    return {
      text: buffer.subarray(0, bytesRead).toString('utf8'),
      nextPosition: start + bytesRead,
      truncated,
    };
  } finally {
    closeSync(fd);
  }
}

/**
 * 轮转后台日志。
 *
 * 后台进程直接继承日志文件的 fd，运行期间无法安全地换文件，
 * 因此只在每次 `start -d` 打开日志前检查大小：超过上限就把当前日志
 * 顺移成 .1/.2/.3，最旧的一份删除。运行中想立刻回收空间用 `logs --clear`。
 *
 * @returns 实际发生轮转时返回 true
 */
export function rotateLogFile(
  file: string,
  maxBytes = LOG_MAX_BYTES,
  keep = LOG_KEEP_FILES,
): boolean {
  if (!existsSync(file)) {
    return false;
  }
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return false;
  }
  if (size <= maxBytes) {
    return false;
  }

  try {
    rmSync(`${file}.${keep}`, { force: true });
    for (let index = keep - 1; index >= 1; index -= 1) {
      const current = `${file}.${index}`;
      if (existsSync(current)) {
        renameSync(current, `${file}.${index + 1}`);
      }
    }
    renameSync(file, `${file}.1`);
    return true;
  } catch {
    // 轮转失败不应阻止启动：继续写原文件即可。
    return false;
  }
}

/** 清空日志文件内容，保留文件本身（后台进程仍持有该 fd）。 */
export function clearLogFile(file: string): void {
  if (!existsSync(file)) {
    throw new CliError(`日志文件不存在: ${file}`);
  }
  try {
    truncateSync(file, 0);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`清空日志失败: ${file} (${reason})`);
  }
}
