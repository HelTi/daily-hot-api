export const CLI_PREFIX = '[daily-hot-api]';

/** 生命周期提示，例如「正在启动…」「已停止」。 */
export function info(message: string): void {
  console.log(`${CLI_PREFIX} ${message}`);
}

/** 进度提示写 stderr，避免污染 --json 的 stdout 输出。 */
export function progress(message: string): void {
  console.error(`${CLI_PREFIX} ${message}`);
}

/** 警告，不中断命令。 */
export function warn(message: string): void {
  console.warn(`${CLI_PREFIX} 警告: ${message}`);
}

/** 错误提示。 */
export function fail(message: string): void {
  console.error(`${CLI_PREFIX} 错误: ${message}`);
}

/** status 等命令的缩进字段行。 */
export function field(label: string, value: string | number): void {
  console.log(`  ${label}: ${value}`);
}

/** 把秒数格式化为人类可读的时长，用于 status。 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes > 0
      ? `${hours} 小时 ${restMinutes} 分钟`
      : `${hours} 小时`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} 天 ${restHours} 小时` : `${days} 天`;
}
