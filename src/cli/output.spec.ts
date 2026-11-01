import { formatDuration } from './output';

describe('output', () => {
  it('格式化秒、分钟、小时和天', () => {
    expect(formatDuration(0)).toBe('0 秒');
    expect(formatDuration(59)).toBe('59 秒');
    expect(formatDuration(60)).toBe('1 分钟');
    expect(formatDuration(3599)).toBe('59 分钟');
    expect(formatDuration(3600)).toBe('1 小时');
    expect(formatDuration(3660)).toBe('1 小时 1 分钟');
    expect(formatDuration(86400)).toBe('1 天');
    expect(formatDuration(90000)).toBe('1 天 1 小时');
  });

  it('负数按 0 处理', () => {
    expect(formatDuration(-5)).toBe('0 秒');
  });
});
