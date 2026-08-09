import { endOfBriefDate, formatBriefDate } from './brief-date';

/**
 * 这两个函数替换掉了原来手写的 Intl 时区偏移计算。
 * 下面把原实现原样保留为参照，逐一比对，确保行为没有变化——
 * 包括夏令时切换这种手写实现最容易出错的场景。
 */
const legacyFormatDate = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const legacyTimezoneOffset = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return (
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    ) - date.getTime()
  );
};

const legacyCreateDateInTimezone = (date: string, timezone: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  const offset = legacyTimezoneOffset(utcGuess, timezone);

  return new Date(utcGuess.getTime() - offset);
};

const TIMEZONES = ['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London'];

const DATES = [
  '2026-01-01',
  '2026-03-08', // 美国夏令时开始当天
  '2026-03-09',
  '2026-06-15',
  '2026-10-25', // 欧洲夏令时结束当天
  '2026-11-01', // 美国夏令时结束当天
  '2026-12-31',
];

describe('formatBriefDate', () => {
  it.each(TIMEZONES)('matches the previous implementation in %s', (tz) => {
    const samples = [
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T15:30:00Z'),
      new Date('2026-06-15T23:59:59Z'),
      new Date('2026-11-01T05:30:00Z'),
      new Date('2026-12-31T16:00:00Z'),
    ];

    samples.forEach((sample) => {
      expect(formatBriefDate(sample, tz)).toBe(legacyFormatDate(sample, tz));
    });
  });

  it('rolls over to the next day for late UTC times in Asia/Shanghai', () => {
    // UTC 16:00 已经是上海的次日 00:00
    expect(
      formatBriefDate(new Date('2026-06-15T16:00:00Z'), 'Asia/Shanghai'),
    ).toBe('2026-06-16');
  });
});

describe('endOfBriefDate', () => {
  it.each(TIMEZONES)('matches the previous implementation in %s', (tz) => {
    DATES.forEach((date) => {
      expect(endOfBriefDate(date, tz).toISOString()).toBe(
        legacyCreateDateInTimezone(date, tz).toISOString(),
      );
    });
  });

  it('returns the last second of the day in the target timezone', () => {
    // 上海 UTC+8：当天 23:59:59 对应 UTC 15:59:59
    expect(endOfBriefDate('2026-06-15', 'Asia/Shanghai').toISOString()).toBe(
      '2026-06-15T15:59:59.000Z',
    );
  });

  it('round-trips with formatBriefDate', () => {
    TIMEZONES.forEach((tz) => {
      DATES.forEach((date) => {
        expect(formatBriefDate(endOfBriefDate(date, tz), tz)).toBe(date);
      });
    });
  });
});
