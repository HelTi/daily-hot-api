import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareVersions,
  neutralCwd,
  parseVersion,
  runCommand,
} from '../../skills/daily-hot-api/scripts/lib/cli.mjs';
import { normalizeBaseUrl } from '../../skills/daily-hot-api/scripts/lib/http.mjs';
import {
  buildHotQuery,
  normalizeBrief,
  normalizeHistory,
  normalizeHot,
  parseArgv,
  parseLimit,
  validateDate,
} from '../../skills/daily-hot-api/scripts/daily-hot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(
  HERE,
  '../../skills/daily-hot-api/scripts/daily-hot.mjs',
);

const LONG_DESC = '很长的描述'.repeat(100);
const LONG_MARKDOWN = '## 简报\n' + '段落内容。'.repeat(2_000);

let server;
let baseUrl;
let skillHome;
let readyStatus = 200;
const requests = [];

function startMockServer() {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      requests.push(url);
      const json = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (url.pathname === '/health') {
        json(200, { status: 'ok', checks: { redis: true } });
        return;
      }
      if (url.pathname === '/ready') {
        json(readyStatus, { status: readyStatus === 200 ? 'ready' : 'not ready' });
        return;
      }
      if (url.pathname === '/hot-lists/all') {
        json(200, {
          code: 200,
          count: 2,
          routes: [
            { name: 'zhihu', title: '知乎', path: '/zhihu' },
            { name: 'weibo', title: '微博', path: '/weibo' },
          ],
        });
        return;
      }
      if (url.pathname === '/hot-lists/zhihu') {
        const limit = Number(url.searchParams.get('limit') ?? 10);
        const data = Array.from({ length: Math.min(limit, 3) }, (_, index) => ({
          id: String(index),
          title: `知乎热点 ${index + 1}`,
          desc: LONG_DESC,
          hot: 1000 - index,
          url: `https://example.com/zhihu/${index + 1}`,
          mobileUrl: `https://m.example.com/zhihu/${index + 1}`,
        }));
        json(200, {
          code: 200,
          name: 'zhihu',
          title: '知乎',
          type: '热榜',
          link: 'https://www.zhihu.com/hot',
          fromCache: true,
          updateTime: '2026-11-02T00:00:00.000Z',
          total: data.length,
          data,
        });
        return;
      }
      if (url.pathname === '/api/history/search') {
        json(200, {
          data: [
            {
              source: 'zhihu',
              title: '历史热点',
              desc: LONG_DESC,
              hot: 88,
              url: 'https://example.com/history/1',
              timestamp: 1762000000000,
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        });
        return;
      }
      if (url.pathname === '/api/briefs/config') {
        json(200, { enabled: false });
        return;
      }
      if (url.pathname === '/api/briefs/latest') {
        json(200, {
          briefDate: '2026-11-02',
          period: 'daily',
          status: 'success',
          sources: ['cls'],
          updatedAt: '2026-11-02T12:00:00.000Z',
          analysis: {
            summary: '今日摘要',
            highlights: ['亮点一'],
            topics: [{ title: '主题一' }, { title: '主题二' }],
          },
          markdown: LONG_MARKDOWN,
          model: 'deepseek-v4-flash',
          tavilyUsed: false,
        });
        return;
      }
      json(404, { message: 'not found' });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function runScript(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: {
        ...process.env,
        DAILY_HOT_API_SKILL_HOME: skillHome,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`script timeout: ${args.join(' ')}`));
    }, 25_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', reject);
  });
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`stdout 不是 JSON（exit ${result.code}）：\n${result.stdout}\n${result.stderr}`);
  }
}

test.before(async () => {
  skillHome = await mkdtemp(path.join(os.tmpdir(), 'dha-skill-test-'));
  await startMockServer();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(skillHome, { recursive: true, force: true });
});

test('compareVersions 与 parseVersion', () => {
  assert.equal(parseVersion('0.1.2')?.raw, '0.1.2');
  assert.equal(parseVersion('nope'), null);
  assert.ok(compareVersions('0.1.2', '0.1.1') > 0);
  assert.ok(compareVersions('22.20.0', '22.19.0') > 0);
  assert.equal(compareVersions('22.20.0', '22.20.0'), 0);
});

test('normalizeBaseUrl 只接受 http(s)', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:6689/'), 'http://127.0.0.1:6689');
  assert.throws(() => normalizeBaseUrl('ftp://example.com'), /http/);
  assert.throws(() => normalizeBaseUrl(''), /不能为空/);
});

test('parseArgv 解析命令、值选项与 flag', () => {
  const { options, positionals } = parseArgv([
    'hot',
    'zhihu',
    '--limit=5',
    '--no-cache',
    '--base-url',
    'http://127.0.0.1:6689',
  ]);
  assert.deepEqual(positionals, ['hot', 'zhihu']);
  assert.equal(options.limit, '5');
  assert.equal(options.noCache, true);
  assert.equal(options.baseUrl, 'http://127.0.0.1:6689');
  assert.throws(() => parseArgv(['hot', '--unknown']), /未知选项/);
  assert.throws(() => parseArgv(['hot', '--limit']), /需要一个值/);
});

test('parseLimit 与 validateDate 校验边界', () => {
  assert.equal(parseLimit(undefined, 10), 10);
  assert.equal(parseLimit('100', 10), 100);
  assert.throws(() => parseLimit('0', 10), /1-100/);
  assert.throws(() => parseLimit('abc', 10), /1-100/);
  assert.equal(validateDate('2026-11-02', 'date'), '2026-11-02');
  assert.throws(() => validateDate('2026/11/02', 'date'), /YYYY-MM-DD/);
  assert.throws(() => validateDate('2026-13-01', 'date'), /不是合法日期/);
});

test('normalizeHot 输出瘦身结果', () => {
  const result = normalizeHot(
    {
      name: 'zhihu',
      title: '知乎',
      fromCache: true,
      updateTime: '2026-11-02T00:00:00.000Z',
      data: [
        {
          title: '热点',
          desc: LONG_DESC,
          hot: 99,
          url: 'https://example.com/1',
          mobileUrl: 'https://m.example.com/1',
        },
      ],
    },
    { full: false },
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].rank, 1);
  assert.equal(result.items[0].url, 'https://example.com/1');
  assert.equal(result.items[0].mobileUrl, undefined);
  assert.ok(result.items[0].desc.length <= 161);
});

test('normalizeHistory 与 normalizeBrief 处理空数据', () => {
  const history = normalizeHistory({
    data: [{ source: 'zhihu', title: 't', url: 'u', timestamp: 1 }],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  assert.equal(history.items[0].rank, 1);
  assert.equal(normalizeBrief(null).found, false);

  const brief = normalizeBrief(
    {
      briefDate: '2026-11-02',
      analysis: { summary: 's', topics: [{}, {}] },
      markdown: LONG_MARKDOWN,
    },
    { full: false },
  );
  assert.equal(brief.found, true);
  assert.equal(brief.topicCount, 2);
  assert.ok(brief.markdown.length <= 6_001);
});

test('doctor 能识别 mock 实例', async () => {
  const result = await runScript(['doctor', '--base-url', baseUrl]);
  assert.equal(result.code, 0);
  const data = parseJson(result);
  assert.equal(data.service.found, true);
  assert.equal(data.service.baseUrl, baseUrl);
  assert.equal(data.status, 'ok');
});

test('sources 返回精简路由', async () => {
  const result = await runScript(['sources', '--base-url', baseUrl]);
  assert.equal(result.code, 0);
  const data = parseJson(result);
  assert.equal(data.count, 2);
  assert.deepEqual(data.sources[0], {
    name: 'zhihu',
    title: '知乎',
    path: '/zhihu',
  });
});

test('hot 默认限制与 desc 截断，并透传参数', async () => {
  requests.length = 0;
  const result = await runScript([
    'hot',
    'zhihu',
    '--limit',
    '2',
    '--type',
    'hot',
    '--no-cache',
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const data = parseJson(result);
  assert.equal(data.items.length, 2);
  assert.equal(data.items[1].rank, 2);
  assert.ok(data.items[0].desc.length <= 161);

  const hotRequest = requests.find((url) => url.pathname === '/hot-lists/zhihu');
  assert.equal(hotRequest.searchParams.get('limit'), '2');
  assert.equal(hotRequest.searchParams.get('type'), 'hot');
  assert.equal(hotRequest.searchParams.get('noCache'), 'true');
});

test('hot 拒绝非法 source（退出码 2）', async () => {
  const result = await runScript(['hot', '../etc/passwd', '--base-url', baseUrl]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /source 不合法/);
});

test('history search 透传过滤条件并瘦身输出', async () => {
  requests.length = 0;
  const result = await runScript([
    'history',
    'search',
    '--source',
    'zhihu',
    '--keyword',
    'AI 热点',
    '--start',
    '2026-10-01',
    '--limit',
    '5',
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const data = parseJson(result);
  assert.equal(data.total, 1);
  assert.equal(data.items[0].rank, 1);
  const request = requests.find((url) => url.pathname === '/api/history/search');
  assert.equal(request.searchParams.get('keyword'), 'AI 热点');
  assert.equal(request.searchParams.get('startDate'), '2026-10-01');
  assert.equal(request.searchParams.get('limit'), '5');
});

test('history 遇到非法日期直接退出 2', async () => {
  const result = await runScript([
    'history',
    'search',
    '--start',
    '2026/10/01',
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.code, 2);
});

test('brief latest 返回摘要与截断后的 markdown', async () => {
  const result = await runScript(['brief', 'latest', '--base-url', baseUrl]);
  assert.equal(result.code, 0, result.stderr);
  const data = parseJson(result);
  assert.equal(data.found, true);
  assert.equal(data.summary, '今日摘要');
  assert.equal(data.topicCount, 2);
  assert.ok(data.markdown.length <= 6_001);
});

test('Mongo 未连接时 history/brief 快速失败并提示', async () => {
  readyStatus = 503;
  try {
    const brief = await runScript(['brief', 'latest', '--base-url', baseUrl]);
    assert.equal(brief.code, 4);
    assert.match(brief.stderr, /MongoDB 未连接/);

    const history = await runScript([
      'history',
      'search',
      '--base-url',
      baseUrl,
    ]);
    assert.equal(history.code, 4);
    assert.match(history.stderr, /MongoDB 未连接/);
  } finally {
    readyStatus = 200;
  }
});

test('stop 在没有 marker 时不停止任何实例', async () => {
  const result = await runScript(['stop']);
  assert.equal(result.code, 0, result.stderr);
  const data = parseJson(result);
  assert.equal(data.stopped, false);
});

test('status 对不可达 base-url 返回退出码 5', async () => {
  const closed = createServer();
  const port = await new Promise((resolve) => {
    closed.listen(0, '127.0.0.1', () => {
      const address = closed.address();
      closed.close(() => resolve(address.port));
    });
  });
  const result = await runScript([
    'status',
    '--base-url',
    `http://127.0.0.1:${port}`,
  ]);
  assert.equal(result.code, 5);
  const data = parseJson(result);
  assert.equal(data.running, false);
});

test('hot 支持来源专属 --param 且拒绝保留参数', async () => {
  requests.length = 0;
  const ok = await runScript([
    'hot',
    'zhihu',
    '--param',
    'area=china',
    '--base-url',
    baseUrl,
  ]);
  assert.equal(ok.code, 0, ok.stderr);
  const request = requests.find((url) => url.pathname === '/hot-lists/zhihu');
  assert.equal(request.searchParams.get('area'), 'china');

  const rejected = await runScript([
    'hot',
    'zhihu',
    '--param',
    'limit=99',
    '--base-url',
    baseUrl,
  ]);
  assert.equal(rejected.code, 2);
  assert.match(rejected.stderr, /保留参数/);
});

test('--help 与 --version 可用', async () => {
  const help = await runScript(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /daily-hot-api agent skill/);
  const version = await runScript(['--version']);
  assert.match(version.stdout, /1\.1\.0/);
});

test('runCli 不继承当前 cwd，避免 npx 绕过 CLI_PIN', async () => {
  // npx 发现 cwd 所在项目能提供同名 bin 时会无视 @<version>，直接跑那个命令。
  // 在 daily-hot-api 仓库里跑 skill 就会命中：实测拿到全局 0.1.2 而不是 pin 的版本。
  const result = await runCommand(
    process.execPath,
    ['-e', 'process.stdout.write(process.cwd())'],
    { timeoutMs: 20_000 },
  );
  assert.equal(result.code, 0, result.stderr);
  const repoRoot = path.resolve(HERE, '../..');
  assert.ok(
    !result.stdout.startsWith(repoRoot),
    `CLI 子进程不应在仓库目录里运行，实际：${result.stdout}`,
  );
  assert.ok(result.stdout.length > 0);

  // 显式传 cwd 仍然生效。
  const explicit = await runCommand(
    process.execPath,
    ['-e', 'process.stdout.write(process.cwd())'],
    { cwd: repoRoot, timeoutMs: 20_000 },
  );
  assert.ok(explicit.stdout.startsWith(repoRoot));
  assert.ok(neutralCwd().length > 0);
});

test('buildHotQuery 接受驼峰参数，拒绝非法与保留 key', () => {
  const query = buildHotQuery({
    limit: '5',
    params: ['pageSize=10', 'cursor=abc', 'area=china'],
  });
  assert.equal(query.limit, 5);
  assert.equal(query.pageSize, '10');
  assert.equal(query.cursor, 'abc');
  assert.equal(query.area, 'china');

  assert.throws(() => buildHotQuery({ params: ['1bad=x'] }), /key 不合法/);
  assert.throws(() => buildHotQuery({ params: ['noCache=1'] }), /保留参数/);
  assert.throws(() => buildHotQuery({ params: ['missing-value'] }), /key=value/);
});

test('hot 透传驼峰参数（服务端 DTO 支持 pageSize）', async () => {
  requests.length = 0;
  const result = await runScript([
    'hot',
    'zhihu',
    '--param',
    'pageSize=10',
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const request = requests.find((url) => url.pathname === '/hot-lists/zhihu');
  assert.equal(request.searchParams.get('pageSize'), '10');
});

test('用法错误先于连服务报出（退出码 2 而不是 4）', async () => {
  const closed = createServer();
  const port = await new Promise((resolve) => {
    closed.listen(0, '127.0.0.1', () => {
      const address = closed.address();
      closed.close(() => resolve(address.port));
    });
  });
  const result = await runScript([
    'hot',
    'zhihu',
    '--param',
    '1bad=x',
    '--base-url',
    `http://127.0.0.1:${port}`,
  ]);
  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stderr, /key 不合法/);
});

test('normalizeBrief 标注未完成状态且不伪造 markdown', () => {
  const generating = normalizeBrief({
    briefDate: '2026-11-02',
    status: 'generating',
    analysis: {},
  });
  assert.equal(generating.markdown, undefined);
  assert.match(generating.note, /正在生成/);

  const failed = normalizeBrief({ briefDate: '2026-11-02', status: 'failed' });
  assert.match(failed.note, /failed/);

  const ok = normalizeBrief({ status: 'success', markdown: '# ok' });
  assert.equal(ok.note, undefined);
});

/** 写一个会记录调用并按需失败的假 CLI，用来验证不该调用 CLI 的路径。 */
async function writeFakeCli(dir, { exitCode = 0, stdout = '{}' } = {}) {
  const cliPath = path.join(dir, 'fake-cli.mjs');
  const callLog = path.join(dir, 'cli-calls.log');
  await writeFile(
    cliPath,
    [
      '#!/usr/bin/env node',
      "import { appendFileSync } from 'node:fs';",
      `appendFileSync(${JSON.stringify(callLog)}, process.argv.slice(2).join(' ') + '\\n');`,
      `process.stdout.write(${JSON.stringify(stdout)});`,
      `process.exit(${exitCode});`,
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(cliPath, 0o755);
  return { cliPath, callLog };
}

test('stop 失败时保留 marker，实例仍可被再次 stop', async (t) => {
  if (process.platform === 'win32') {
    t.skip('依赖 POSIX shebang 可执行文件');
    return;
  }
  const home = await mkdtemp(path.join(os.tmpdir(), 'dha-skill-stop-'));
  try {
    const { cliPath } = await writeFakeCli(home, {
      exitCode: 1,
      stdout: '{"stopped":false}',
    });
    const markerFile = path.join(home, '.started-by-skill');
    await writeFile(markerFile, JSON.stringify({ port: 1, baseUrl: 'http://127.0.0.1:1' }));

    const failed = await runScript(['stop'], {
      env: { DAILY_HOT_API_SKILL_HOME: home, DAILY_HOT_API_CLI: cliPath },
    });
    assert.equal(failed.code, 4);
    assert.match(failed.stderr, /标记文件已保留/);

    // marker 还在：换成会成功的 CLI 后仍然能停。
    const { cliPath: okCli } = await writeFakeCli(home, {
      exitCode: 0,
      stdout: '{"stopped":true}',
    });
    const ok = await runScript(['stop'], {
      env: { DAILY_HOT_API_SKILL_HOME: home, DAILY_HOT_API_CLI: okCli },
    });
    assert.equal(ok.code, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).stopped, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('marker 命中时不再为了拿端口去 spawn CLI', async (t) => {
  if (process.platform === 'win32') {
    t.skip('依赖 POSIX shebang 可执行文件');
    return;
  }
  const home = await mkdtemp(path.join(os.tmpdir(), 'dha-skill-marker-'));
  try {
    const { cliPath, callLog } = await writeFakeCli(home);
    await mkdir(path.join(home, 'logs'), { recursive: true });
    await writeFile(
      path.join(home, '.started-by-skill'),
      JSON.stringify({ port: 1, baseUrl, cliVersion: '0.1.2' }),
    );

    const result = await runScript(['status'], {
      env: { DAILY_HOT_API_SKILL_HOME: home, DAILY_HOT_API_CLI: cliPath },
    });
    assert.equal(result.code, 0, result.stderr);
    const data = parseJson(result);
    assert.equal(data.running, true);
    assert.equal(data.source, 'skill');
    assert.equal(data.baseUrl, baseUrl);
    assert.equal(existsSync(callLog), false, 'marker 命中时不应调用 CLI');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
