import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

/** 取某个时刻在指定时区下的日期，格式 YYYY-MM-DD。 */
export const formatBriefDate = (date: Date, tz: string): string =>
  dayjs(date).tz(tz).format('YYYY-MM-DD');

/** 取某个简报日期在指定时区下的当天最后一秒。 */
export const endOfBriefDate = (briefDate: string, tz: string): Date =>
  dayjs.tz(`${briefDate} 23:59:59`, tz).toDate();
