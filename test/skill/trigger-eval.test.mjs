import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EvalError,
  buildCatalogPrompt,
  parseFrontmatter,
  parseJudgeResponse,
  readSkill,
  summarize,
  triggerDetectorFor,
  validateDataset,
} from '../../evals/daily-hot-api/run-trigger-eval.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const SCRIPT = path.join(REPO_ROOT, 'evals/daily-hot-api/run-trigger-eval.mjs');
const DATASET = path.join(REPO_ROOT, 'evals/daily-hot-api/trigger-queries.json');
const SKILL_DIR = path.join(REPO_ROOT, 'skills/daily-hot-api');

let dataset;
let server;
let port;
let flip = false;
const receivedQueries = [];

function startMockModel() {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        const body = JSON.parse(raw);
        const query = body.messages?.find((item) => item.role === 'user')?.content;
        receivedQueries.push(query);
        const entry = dataset.queries.find((item) => item.query === query);
        if (!entry) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'unknown query' } }));
          return;
        }
        const expected = flip ? !entry.should_trigger : entry.should_trigger;
        const content = JSON.stringify({
          use_skill: expected,
          skill: expected ? 'daily-hot-api' : null,
          reason: 'mock judge',
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });
}

function runEval(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MOCK_API_KEY: 'test-secret-key',
        OPENAI_API_BASE_URL: '',
        OPENAI_API_KEY: '',
        AI_MODEL: '',
        TRIGGER_EVAL_API_BASE_URL: '',
        TRIGGER_EVAL_MODEL: '',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`eval timeout: ${args.join(' ')}`));
    }, 60_000);
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

function mockCatalogArgs() {
  return [
    '--provider',
    'catalog',
    '--base-url',
    `http://127.0.0.1:${port}`,
    '--model',
    'mock-model',
    '--api-key-env',
    'MOCK_API_KEY',
    '--runs',
    '1',
    '--concurrency',
    '5',
  ];
}

test.before(async () => {
  dataset = JSON.parse(await readFile(DATASET, 'utf8'));
  await startMockModel();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm('/tmp/dha-trigger-report.md', { force: true });
});

test('评测集结构合法且正负均衡', () => {
  const normalized = validateDataset(dataset);
  assert.equal(normalized.total, 20);
  assert.equal(normalized.positives, 10);
  assert.equal(normalized.negatives, 10);
  assert.equal(new Set(normalized.queries.map((item) => item.id)).size, 20);
});

test('评测集拒绝非法结构', () => {
  assert.throws(
    () => validateDataset({ queries: [{ id: 'x', query: '', should_trigger: 'yes' }] }),
    EvalError,
  );
  assert.throws(
    () => validateDataset({ queries: [] }, { allowSmall: true }),
    /数量不足|校验失败/,
  );
});

test('读取 SKILL.md 元数据', async () => {
  const skill = await readSkill(SKILL_DIR);
  assert.equal(skill.name, 'daily-hot-api');
  assert.equal(skill.version, '1.0.0');
  assert.ok(skill.description.includes('热搜'));
  assert.ok(skill.description.includes('Do not use for fetching full article text'));
});

test('frontmatter 解析支持多行描述', () => {
  const parsed = parseFrontmatter(
    '---\nname: demo\ndescription: 第一行\n  第二行\nlicense: MIT\n---\nbody',
  );
  assert.equal(parsed.name, 'demo');
  assert.equal(parsed.description, '第一行 第二行');
  assert.equal(parsed.license, 'MIT');
});

test('catalog prompt 只包含 name/description，不泄漏正文', async () => {
  const skill = await readSkill(SKILL_DIR);
  const prompt = buildCatalogPrompt(skill);
  assert.ok(prompt.includes('<name>daily-hot-api</name>'));
  assert.ok(prompt.includes(skill.description));
  assert.ok(!prompt.includes('## 何时使用'));
  assert.ok(!prompt.includes('## 快速开始'));
});

test('parseJudgeResponse 支持纯 JSON、fenced 和前后废话', () => {
  assert.deepEqual(parseJudgeResponse('{"use_skill":true,"skill":"daily-hot-api"}'), {
    useSkill: true,
    skill: 'daily-hot-api',
    reason: '',
  });
  assert.equal(
    parseJudgeResponse('```json\n{"use_skill":false,"skill":null,"reason":"no"}\n```').useSkill,
    false,
  );
  assert.equal(
    parseJudgeResponse('结论如下：{"use_skill":true,"skill":"daily-hot-api","reason":"hot"} 完毕').useSkill,
    true,
  );
  assert.throws(() => parseJudgeResponse('not json'), EvalError);
  assert.throws(() => parseJudgeResponse('{"skill":"x"}'), /use_skill/);
});

test('summarize 计算召回/特异度并判定通过', () => {
  const queries = [
    { id: 'p1', query: 'p1', shouldTrigger: true },
    { id: 'p2', query: 'p2', shouldTrigger: true },
    { id: 'n1', query: 'n1', shouldTrigger: false },
    { id: 'n2', query: 'n2', shouldTrigger: false },
  ];
  const options = {
    triggerRate: 0.5,
    minPositive: 0.9,
    minNegative: 0.9,
    maxErrors: 0,
  };
  const perfect = new Map([
    ['p1', [{ triggered: true }]],
    ['p2', [{ triggered: true }]],
    ['n1', [{ triggered: false }]],
    ['n2', [{ triggered: false }]],
  ]);
  const ok = summarize(queries, perfect, options);
  assert.equal(ok.passed, true);
  assert.equal(ok.recall, 1);
  assert.equal(ok.specificity, 1);

  const missed = new Map(perfect);
  missed.set('p2', [{ triggered: false }]);
  const bad = summarize(queries, missed, options);
  assert.equal(bad.passed, false);
  assert.equal(bad.recall, 0.5);
  assert.deepEqual(bad.falseNegatives, ['p2']);

  const falsePositive = new Map(perfect);
  falsePositive.set('n1', [{ triggered: true }]);
  const fp = summarize(queries, falsePositive, options);
  assert.equal(fp.specificity, 0.5);
  assert.deepEqual(fp.falsePositives, ['n1']);
});

test('agent 触发检测器区分真实 tool_use 与普通提及', () => {
  const detector = triggerDetectorFor('claude');
  const stream = JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'x', name: 'Skill', input: { skill: 'daily-hot-api' } },
      ],
    },
  });
  detector.lastIndex = 0;
  assert.equal(detector.test(stream), true);

  const plainText = '我建议你使用 daily-hot-api 这个工具来查热搜，但它没有被调用。';
  detector.lastIndex = 0;
  assert.equal(detector.test(plainText), false);

  const custom = triggerDetectorFor('claude', /CUSTOM_MARK/u);
  assert.equal(custom.test('xx CUSTOM_MARK'), true);
});

test('catalog provider 端到端：全部正确时通过且不泄漏 key', async () => {
  flip = false;
  receivedQueries.length = 0;
  const result = await runEval(
    [...mockCatalogArgs(), '--report', '/tmp/dha-trigger-report.md'],
  );
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.recall, 1);
  assert.equal(report.specificity, 1);
  assert.equal(report.totalRuns, 20);
  assert.equal(receivedQueries.length, 20);
  assert.ok(!result.stdout.includes('test-secret-key'));
  assert.ok(!result.stderr.includes('test-secret-key'));
});

test('catalog provider 端到端：全部判反时失败（退出码 1）', async () => {
  flip = true;
  const result = await runEval(mockCatalogArgs());
  assert.equal(result.code, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, false);
  assert.equal(report.recall, 0);
  assert.equal(report.specificity, 0);
  flip = false;
});

test('缺少配置时退出码 3，且不打印 key', async () => {
  const result = await runEval(['--provider', 'catalog', '--runs', '1'], {
    MOCK_API_KEY: '',
  });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /缺少配置/);
  assert.ok(!result.stderr.includes('test-secret-key'));
});

test('--dry-run 不需要模型配置且校验数据集', async () => {
  const result = await runEval(['--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dryRun, true);
  assert.equal(report.dataset.total, 20);
  assert.equal(report.dataset.positives, 10);
  assert.equal(report.dataset.negatives, 10);
});

test('未知 provider / 非法阈值返回退出码 2', async () => {
  const unknown = await runEval(['--provider', 'nope']);
  assert.equal(unknown.code, 2);
  const threshold = await runEval(['--min-positive', '1.5']);
  assert.equal(threshold.code, 2);
});

test('--help 可用', async () => {
  const result = await runEval(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /触发评测/);
});
