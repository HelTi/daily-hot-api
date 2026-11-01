import { closeSync, existsSync, openSync, readSync, statSync } from 'fs';
import { CliError } from './errors';

export const LOG_TAIL_MAX_BYTES = 256 * 1024;

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
    readSync(fd, buffer, 0, buffer.length, start);
    let text = buffer.toString('utf8');
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
    readSync(fd, buffer, 0, buffer.length, start);
    return { text: buffer.toString('utf8'), nextPosition: size, truncated };
  } finally {
    closeSync(fd);
  }
}
