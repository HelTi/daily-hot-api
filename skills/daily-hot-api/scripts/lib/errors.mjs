/**
 * 共享错误类型与退出码。
 *
 * 退出码约定（SKILL.md 与 references/troubleshooting.md 必须保持一致）：
 *   0  成功
 *   2  用法错误（参数、未知 source、非法 URL 等）
 *   3  前置条件不满足（Node 版本、CLI 无法启动、服务启动失败）
 *   4  服务或上游数据失败（网络、超时、5xx）
 *   5  服务未运行 / 无法找到实例
 */

export const EXIT_CODES = Object.freeze({
  OK: 0,
  USAGE: 2,
  PREREQUISITE: 3,
  SERVICE: 4,
  NOT_RUNNING: 5,
});

export class SkillError extends Error {
  /**
   * @param {string} message 面向用户/agent 的错误信息（可包含修复建议）
   * @param {object} [options]
   * @param {number} [options.exitCode]
   * @param {string} [options.code] 机器可读错误码，例如 http_error / timeout
   * @param {object} [options.details] 附加信息，序列化到 JSON 时使用
   */
  constructor(message, { exitCode = 1, code = 'error', details } = {}) {
    super(message);
    this.name = 'SkillError';
    this.exitCode = exitCode;
    this.code = code;
    this.details = details;
  }
}

export function usageError(message, details) {
  return new SkillError(message, {
    exitCode: EXIT_CODES.USAGE,
    code: 'usage',
    details,
  });
}

export function prerequisiteError(message, details) {
  return new SkillError(message, {
    exitCode: EXIT_CODES.PREREQUISITE,
    code: 'prerequisite',
    details,
  });
}

export function serviceError(message, details) {
  return new SkillError(message, {
    exitCode: EXIT_CODES.SERVICE,
    code: 'service',
    details,
  });
}
