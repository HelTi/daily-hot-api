#!/usr/bin/env node
/**
 * CLI 生命周期冒烟测试：start -d → status → logs → restart → stop。
 *
 * 单元测试只覆盖到 helper，真正容易回归的是派生后台进程、状态文件、
 * 健康轮询这条链路，所以这里用真实进程跑一遍。
 *
 * 用法：node test/cli/lifecycle-smoke.mjs（需要先 npm run build）
 * 全程使用临时状态目录和空闲端口，不会碰开发者自己的实例。
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin', 'daily-hot-api.js');

function runCli(args, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DAILY_HOT_API_HOME: '', NODE_ENV: 'test' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI 超时: ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function parseJson(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `${label} 的 stdout 不是 JSON（exit ${result.code}）：\n${result.stdout}\n${result.stderr}`,
    );
  }
}

const steps = [];
function step(name) {
  steps.push(name);
  console.error(`[smoke] ${name}`);
}

async function main() {
  if (!existsSync(BIN) || !existsSync(path.join(REPO_ROOT, 'dist', 'cli'))) {
    throw new Error('请先执行 npm run build');
  }

  const home = await mkdtemp(path.join(os.tmpdir(), 'dha-smoke-'));
  const configFile = path.join(home, 'smoke.env');
  const port = await freePort();
  const stateFile = path.join(home, 'daily-hot-api.json');
  const logFile = path.join(home, 'logs', 'daily-hot-api.log');

  // 最小配置：不开简报与调度，Mongo 指向不可达地址，避免连到真实数据库。
  await writeFile(
    configFile,
    [
      'BRIEF_ENABLED=false',
      'SCHEDULER_AUTO_START=false',
      'MONGODB_URI=mongodb://127.0.0.1:1/daily-hot-api-smoke',
      '',
    ].join('\n'),
    'utf8',
  );

  const base = ['--home', home];
  try {
    step('status 在未启动时返回 3');
    const idle = await runCli(['status', '--json', ...base]);
    assert.equal(idle.code, 3, idle.stderr);
    assert.equal(parseJson(idle, 'status').running, false);

    step('start -d 启动后台实例');
    const start = await runCli([
      'start',
      '-d',
      '--port',
      String(port),
      '--host',
      '127.0.0.1',
      '--config',
      configFile,
      ...base,
    ]);
    assert.equal(start.code, 0, `${start.stdout}\n${start.stderr}`);
    assert.ok(existsSync(stateFile), '应写入状态文件');
    assert.ok(existsSync(logFile), '应写入日志文件');

    step('status 报告运行中且健康检查通过');
    const status = await runCli(['status', '--json', ...base]);
    assert.equal(status.code, 0, status.stderr);
    const state = parseJson(status, 'status');
    assert.equal(state.running, true);
    assert.equal(state.port, port);
    assert.equal(state.host, '127.0.0.1');
    assert.equal(state.mode, 'daemon');
    assert.equal(state.health, true, '/health 应可达');

    step('/health 返回本服务的响应体');
    const health = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(typeof body.status, 'string');
    assert.equal(typeof body.checks, 'object');

    step('--host 127.0.0.1 只绑定回环地址');
    assert.equal(
      await isListeningOnAllInterfaces(port),
      false,
      '绑定 127.0.0.1 时不应能从非回环地址连上',
    );

    step('logs 能读到日志，--clear 能清空');
    const logs = await runCli(['logs', '-n', '20', ...base]);
    assert.equal(logs.code, 0, logs.stderr);
    assert.ok(logs.stdout.length > 0, 'logs 应有输出');
    const cleared = await runCli(['logs', '--clear', ...base]);
    assert.equal(cleared.code, 0, cleared.stderr);
    assert.equal(statSync(logFile).size, 0, '--clear 后日志应为空');

    step('restart 沿用端口与后台模式');
    const restart = await runCli(['restart', ...base]);
    assert.equal(restart.code, 0, `${restart.stdout}\n${restart.stderr}`);
    const afterRestart = parseJson(
      await runCli(['status', '--json', ...base]),
      'status',
    );
    assert.equal(afterRestart.running, true);
    assert.equal(afterRestart.port, port);
    assert.equal(afterRestart.mode, 'daemon');
    assert.notEqual(afterRestart.pid, state.pid, 'restart 应换新进程');

    step('stop 停止实例并清理状态文件');
    const stop = await runCli(['stop', '--json', ...base]);
    assert.equal(stop.code, 0, stop.stderr);
    assert.equal(parseJson(stop, 'stop').stopped, true);
    assert.equal(existsSync(stateFile), false, '状态文件应被清理');

    step('stop 幂等、status 回到未运行');
    const stopAgain = await runCli(['stop', '--json', ...base]);
    assert.equal(stopAgain.code, 0, stopAgain.stderr);
    const final = await runCli(['status', '--json', ...base]);
    assert.equal(final.code, 3);
  } finally {
    // 任何断言失败都不要留下后台进程。
    await runCli(['stop', '--force', '--json', ...base]).catch(() => undefined);
    await rm(home, { recursive: true, force: true });
  }

  console.error(`[smoke] 全部通过（${steps.length} 步）`);
}

/** 用一个非回环的本机地址尝试连接，验证 --host 真的限制了监听范围。 */
async function isListeningOnAllInterfaces(port) {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info && info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);
  if (addresses.length === 0) {
    // CI 容器里可能只有回环网卡，这一项无法验证。
    console.error('[smoke] 跳过：没有非回环 IPv4 地址');
    return false;
  }
  for (const address of addresses) {
    const reachable = await new Promise((resolve) => {
      const socket = net.connect({ host: address, port });
      const finish = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(1_000);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
    if (reachable) return true;
  }
  return false;
}

main().catch((error) => {
  console.error(`[smoke] 失败：${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
