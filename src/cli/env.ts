import { existsSync, readFileSync } from 'fs';
import * as dotenv from 'dotenv';
import { CliError } from './errors';
import { DEFAULT_PORT } from './paths';

/**
 * 把 .env 文件合并进给定的 env 对象。
 *
 * 规则与 dotenv 默认行为一致：已经存在的环境变量不会被文件覆盖，
 * 因此命令行 --port、shell 导出的变量优先于 .env。
 *
 * @returns 实际从文件中写入的变量名（不返回值，避免泄露密钥）
 */
export function applyEnvFile(
  envFile: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (!existsSync(envFile)) {
    throw new CliError(`配置文件不存在: ${envFile}`);
  }

  let parsed: dotenv.DotenvParseOutput;
  try {
    parsed = dotenv.parse(readFileSync(envFile));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`读取配置文件失败: ${envFile} (${reason})`);
  }

  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}

/**
 * 端口优先级：--port > 环境变量 PORT（含 .env）> 默认 6689。
 */
export function resolvePort(
  flagPort: number | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (flagPort !== undefined) {
    return flagPort;
  }

  const raw = (env.PORT ?? '').trim();
  if (!raw) {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(raw)) {
    throw new CliError(`环境变量 PORT 配置无效: "${raw}"，应为 1-65535 的整数`);
  }

  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new CliError(`环境变量 PORT 配置无效: "${raw}"，应为 1-65535 的整数`);
  }
  return port;
}
