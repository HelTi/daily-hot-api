#!/usr/bin/env node
/**
 * daily-hot-api Agent Skill 触发评测脚本。
 *
 * 目标：验证 SKILL.md 的 description 是否能在真实请求中正确触发/不触发这个 skill。
 *
 * 支持三种 provider：
 *   catalog  用 OpenAI 兼容接口模拟宿主做「技能路由判断」（只看 name + description），
 *            适合快速迭代 description，不需要安装 agent。
 *   claude   用本机 Claude Code CLI（claude -p --output-format stream-json）实际触发，
 *            通过 stream 中是否出现 Skill 工具调用来判定。
 *   codex    用本机 Codex CLI（codex exec --json）实际触发，通过输出中是否读取
 *            .agents/skills/daily-hot-api/SKILL.md 来判定。
 *
 * 用法：
 *   node evals/daily-hot-api/run-trigger-eval.mjs --provider catalog --runs 3 --report /tmp/report.md
 *   node evals/daily-hot-api/run-trigger-eval.mjs --provider claude --runs 1
 *   node evals/daily-hot-api/run-trigger-eval.mjs --dry-run
 *
 * 输出：stdout 为 JSON 结果，进度/诊断写 stderr；退出码 0 通过、1 未通过、2 用法错误、3 配置错误。
 */

import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_SKILL_DIR = path.join(REPO_ROOT, 'skills', 'daily-hot-api');
const DEFAULT_DATASET = path.join(HERE, 'trigger-queries.json');

const PROVIDERS = new Set(['catalog', 'claude', 'codex']);
const IS_WINDOWS = process.platform === 'win32';

class EvalError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'EvalError';
    this.exitCode = exitCode;
  }
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    provider: 'catalog',
    runs: 3,
    dataset: DEFAULT_DATASET,
    skillDir: DEFAULT_SKILL_DIR,
    concurrency: undefined,
    triggerRate: 0.5,
    minPositive: 0.9,
    minNegative: 0.9,
    maxErrors: 0,
    temperature: 0,
    timeoutMs: 30_000,
    agentTimeoutMs: 180_000,
    report: undefined,
    jsonOut: undefined,
    dryRun: false,
    allowSmall: false,
    verbose: false,
    keepWorkspace: false,
    triggerPattern: undefined,
    baseUrl: undefined,
    model: undefined,
    apiKeyEnv: 'OPENAI_API_KEY',
    help: false,
  };

  const valueOptions = new Map([
    ['--provider', 'provider'],
    ['--runs', 'runs'],
    ['--dataset', 'dataset'],
    ['--skill-dir', 'skillDir'],
    ['--concurrency', 'concurrency'],
    ['--trigger-rate', 'triggerRate'],
    ['--min-positive', 'minPositive'],
    ['--min-negative', 'minNegative'],
    ['--max-errors', 'maxErrors'],
    ['--temperature', 'temperature'],
    ['--timeout-ms', 'timeoutMs'],
    ['--agent-timeout-ms', 'agentTimeoutMs'],
    ['--report', 'report'],
    ['--json-out', 'jsonOut'],
    ['--base-url', 'baseUrl'],
    ['--model', 'model'],
    ['--api-key-env', 'apiKeyEnv'],
    ['--trigger-pattern', 'triggerPattern'],
  ]);
  const flagOptions = new Map([
    ['--dry-run', 'dryRun'],
    ['--allow-small', 'allowSmall'],
    ['--verbose', 'verbose'],
    ['--keep-workspace', 'keepWorkspace'],
    ['-h', 'help'],
    ['--help', 'help'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equalIndex = arg.indexOf('=');
    const name = equalIndex === -1 ? arg : arg.slice(0, equalIndex);
    const inlineValue = equalIndex === -1 ? undefined : arg.slice(equalIndex + 1);

    if (flagOptions.has(name)) {
      if (inlineValue !== undefined) {
        throw new EvalError(`选项 ${name} 不接受值。`);
      }
      options[flagOptions.get(name)] = true;
      continue;
    }
    if (valueOptions.has(name)) {
      const value = inlineValue ?? argv[index + 1];
      if (value === undefined) {
        throw new EvalError(`选项 ${name} 需要一个值。`);
      }
      if (inlineValue === undefined) index += 1;
      options[valueOptions.get(name)] = value;
      continue;
    }
    throw new EvalError(`未知选项：${arg}（--help 查看用法）`);
  }

  options.runs = toInteger(options.runs, '--runs', 1);
  options.concurrency = toOptionalInteger(
    options.concurrency,
    '--concurrency',
    1,
  );
  options.triggerRate = toRatio(options.triggerRate, '--trigger-rate');
  options.minPositive = toRatio(options.minPositive, '--min-positive');
  options.minNegative = toRatio(options.minNegative, '--min-negative');
  options.maxErrors = toInteger(options.maxErrors, '--max-errors', 0);
  options.temperature = toNumber(options.temperature, '--temperature');
  options.timeoutMs = toInteger(options.timeoutMs, '--timeout-ms', 1_000);
  options.agentTimeoutMs = toInteger(
    options.agentTimeoutMs,
    '--agent-timeout-ms',
    5_000,
  );

  if (!PROVIDERS.has(options.provider)) {
    throw new EvalError(
      `未知 provider：${options.provider}（可选：${[...PROVIDERS].join(', ')}）`,
    );
  }
  if (options.triggerPattern) {
    try {
      options.triggerPattern = new RegExp(options.triggerPattern, 'i');
    } catch (error) {
      throw new EvalError(
        `--trigger-pattern 不是合法正则：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (options.provider !== 'catalog') {
    options.concurrency ??= 1;
  }
  options.concurrency ??= 3;

  return options;
}

function toInteger(value, name, minimum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new EvalError(`${name} 必须是 >= ${minimum} 的整数。`);
  }
  return number;
}

function toOptionalInteger(value, name, minimum) {
  if (value === undefined) return undefined;
  return toInteger(value, name, minimum);
}

function toNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new EvalError(`${name} 必须是数字。`);
  }
  return number;
}

function toRatio(value, name) {
  const number = toNumber(value, name);
  if (number < 0 || number > 1) {
    throw new EvalError(`${name} 必须在 0–1 之间。`);
  }
  return number;
}

function helpText() {
  return `daily-hot-api 触发评测

用法:
  node evals/daily-hot-api/run-trigger-eval.mjs [options]

provider:
  --provider catalog（默认）          用 OpenAI 兼容接口做技能路由判断
  --provider claude                  用本机 Claude Code CLI 实际触发
  --provider codex                   用本机 Codex CLI 实际触发

通用:
  --dataset <path>        评测集，默认 evals/daily-hot-api/trigger-queries.json
  --skill-dir <path>      skill 目录，默认 skills/daily-hot-api
  --runs <n>              每个 query 重复次数，默认 3
  --concurrency <n>       并发数；catalog 默认 3，agent 固定 1
  --trigger-rate <0-1>    单 query 触发率阈值，默认 0.5
  --min-positive <0-1>    正样本召回阈值，默认 0.9
  --min-negative <0-1>    负样本特异度阈值，默认 0.9
  --max-errors <n>        允许的运行错误数，默认 0
  --report <path>         额外写一份 Markdown 报告
  --json-out <path>       额外写一份 JSON 结果
  --dry-run               只校验配置和数据，不调用模型
  --allow-small           允许评测集少于 8 正 8 负（仅调试用）
  --verbose               输出每个 query 的判定
  --keep-workspace        agent provider 保留临时目录便于排查
  --trigger-pattern <re>  agent provider 自定义触发正则（覆盖默认）
  --help                  查看帮助

catalog provider 配置（按优先级）:
  --base-url / TRIGGER_EVAL_API_BASE_URL / OPENAI_API_BASE_URL
  --model    / TRIGGER_EVAL_MODEL / AI_MODEL
  --api-key-env 默认 OPENAI_API_KEY（只读环境变量，不读取或打印 .env）
  --temperature 默认 0；--timeout-ms 默认 30000

claude/codex provider:
  需要本机已安装并登录对应 CLI；脚本会创建临时项目目录并复制 skill，
  然后根据输出判断是否触发（可用 --trigger-pattern 覆盖）。

退出码:
  0 通过；1 未通过阈值；2 用法错误；3 配置/依赖缺失

示例:
  # 用 DeepSeek/OpenAI 兼容接口快速迭代 description
  set -a; source ./.env; set +a
  node evals/daily-hot-api/run-trigger-eval.mjs --runs 3 --report /tmp/trigger-report.md

  # 用真实 Claude Code 验证（费用更高，建议 --runs 1）
  node evals/daily-hot-api/run-trigger-eval.mjs --provider claude --runs 1`;
}

// ---------------------------------------------------------------------------
// SKILL.md / 数据集加载
// ---------------------------------------------------------------------------

export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new EvalError('SKILL.md 缺少 frontmatter。', 3);
  }
  const result = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const value = unquote(keyMatch[2].trim());
      result[currentKey] = value;
      continue;
    }
    if (currentKey && /^\s+/.test(line)) {
      result[currentKey] = `${result[currentKey] ?? ''} ${line.trim()}`.trim();
    }
  }
  return result;
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

export async function readSkill(skillDir) {
  const file = path.join(skillDir, 'SKILL.md');
  const text = await readFile(file, 'utf8');
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter.name || !frontmatter.description) {
    throw new EvalError(`${file} 缺少 name 或 description。`, 3);
  }
  return {
    dir: skillDir,
    file,
    name: frontmatter.name,
    description: frontmatter.description,
    version: parseMetadataVersion(text),
  };
}

function parseMetadataVersion(text) {
  const match = text.match(/^\s{2}version:\s*"?([^"\n]+)"?$/m);
  return match ? match[1].trim() : null;
}

export function validateDataset(dataset, { allowSmall = false } = {}) {
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.queries)) {
    throw new EvalError('评测集必须是 JSON 对象，且包含 queries 数组。', 3);
  }
  const ids = new Set();
  const errors = [];
  dataset.queries.forEach((entry, index) => {
    const label = entry?.id ? `#${index + 1} (${entry.id})` : `#${index + 1}`;
    if (typeof entry?.id !== 'string' || !entry.id.trim()) {
      errors.push(`${label}: 缺少 id`);
    } else if (ids.has(entry.id)) {
      errors.push(`${label}: id 重复`);
    } else {
      ids.add(entry.id);
    }
    if (typeof entry?.query !== 'string' || !entry.query.trim()) {
      errors.push(`${label}: query 不能为空`);
    }
    if (typeof entry?.should_trigger !== 'boolean') {
      errors.push(`${label}: should_trigger 必须是 boolean`);
    }
  });

  const positives = dataset.queries.filter(
    (entry) => entry?.should_trigger === true,
  ).length;
  const negatives = dataset.queries.length - positives;
  const minPerClass = allowSmall ? 1 : 8;
  if (positives < minPerClass || negatives < minPerClass) {
    errors.push(
      `评测集数量不足：正样本 ${positives}、负样本 ${negatives}（至少 ${minPerClass}/类；调试可加 --allow-small）`,
    );
  }

  if (errors.length > 0) {
    throw new EvalError(`评测集校验失败：\n- ${errors.join('\n- ')}`, 3);
  }
  return {
    total: dataset.queries.length,
    positives,
    negatives,
    queries: dataset.queries.map((entry) => ({
      id: entry.id.trim(),
      query: entry.query.trim(),
      shouldTrigger: entry.should_trigger,
      category: typeof entry.category === 'string' ? entry.category : undefined,
      rationale:
        typeof entry.rationale === 'string' ? entry.rationale : undefined,
    })),
  };
}

export async function loadDataset(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new EvalError(
      `无法读取评测集 ${file}：${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new EvalError(
      `评测集不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }
}

// ---------------------------------------------------------------------------
// catalog provider
// ---------------------------------------------------------------------------

export function buildCatalogPrompt(skill) {
  return `You are a skill router for a coding agent. Decide whether the skill below should be activated for the user request.

Available skills:
<available_skills>
<skill>
<name>${skill.name}</name>
<description>${skill.description}</description>
</skill>
</available_skills>

Rules:
- Decide only from the skill's name and description. Do not assume capabilities that are not described.
- Matching a keyword alone is not enough; the task must actually need what the skill provides.
- If the request needs a different capability (full article text, arbitrary scraping, real-time monitoring, unrelated work), do not activate.

Answer with JSON only, no markdown, no extra text:
{"use_skill": true or false, "skill": "<name>" or null, "reason": "short reason"}`;
}

export function parseJudgeResponse(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new EvalError('模型返回为空。', 3);

  let candidate = raw;
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1].trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new EvalError(
      `无法解析模型判定：${error instanceof Error ? error.message : String(error)}；原始输出：${truncate(raw, 300)}`,
      3,
    );
  }
  if (typeof parsed.use_skill !== 'boolean') {
    throw new EvalError(
      `模型判定缺少 boolean use_skill：${truncate(raw, 300)}`,
      3,
    );
  }
  return {
    useSkill: parsed.use_skill,
    skill: typeof parsed.skill === 'string' ? parsed.skill : null,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

function resolveCatalogConfig(options) {
  const baseUrl =
    options.baseUrl ??
    process.env.TRIGGER_EVAL_API_BASE_URL ??
    process.env.OPENAI_API_BASE_URL;
  const model =
    options.model ??
    process.env.TRIGGER_EVAL_MODEL ??
    process.env.AI_MODEL ??
    null;
  const apiKey = process.env[options.apiKeyEnv];

  const missing = [];
  if (!baseUrl) missing.push('--base-url 或 TRIGGER_EVAL_API_BASE_URL/OPENAI_API_BASE_URL');
  if (!model) missing.push('--model 或 TRIGGER_EVAL_MODEL/AI_MODEL');
  if (!apiKey) missing.push(`环境变量 ${options.apiKeyEnv}`);
  if (missing.length > 0) {
    throw new EvalError(
      `catalog provider 缺少配置：${missing.join('；')}。可先执行 \`set -a; source ./.env; set +a\`，不会读取或打印 .env。`,
      3,
    );
  }
  return {
    baseUrl: String(baseUrl).replace(/\/+$/, ''),
    model,
    apiKey,
    apiKeyEnv: options.apiKeyEnv,
  };
}

function describeCatalogConfig(options) {
  const baseUrl =
    options.baseUrl ??
    process.env.TRIGGER_EVAL_API_BASE_URL ??
    process.env.OPENAI_API_BASE_URL ??
    null;
  const model =
    options.model ??
    process.env.TRIGGER_EVAL_MODEL ??
    process.env.AI_MODEL ??
    null;
  return {
    baseUrl: baseUrl ? String(baseUrl).replace(/\/+$/, '') : null,
    model,
    hasApiKey: Boolean(process.env[options.apiKeyEnv]),
  };
}

function joinApiUrl(baseUrl, endpoint) {
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

async function callChatCompletion(config, messages, options) {
  const url = joinApiUrl(config.baseUrl, '/chat/completions');
  const attempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options.temperature,
          max_tokens: 80,
          stream: false,
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      const text = await response.text();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const authError = new EvalError(
            `模型接口鉴权失败（HTTP ${response.status}），请检查 ${config.apiKeyEnv}。`,
            3,
          );
          authError.retryable = false;
          throw authError;
        }
        if (attempt < attempts && (response.status === 429 || response.status >= 500)) {
          lastError = new EvalError(
            `模型接口 HTTP ${response.status}：${truncate(text, 200)}`,
            3,
          );
          await sleep(500 * attempt);
          continue;
        }
        throw new EvalError(
          `模型接口 HTTP ${response.status}：${truncate(text, 500)}`,
          3,
        );
      }
      const data = JSON.parse(text);
      return extractMessageContent(data);
    } catch (error) {
      if (error instanceof EvalError) {
        if (
          attempt >= attempts ||
          error.exitCode !== 3 ||
          error.retryable === false
        ) {
          throw error;
        }
        lastError = error;
        continue;
      }
      if (attempt >= attempts) {
        throw new EvalError(
          `模型接口请求失败：${error instanceof Error ? error.message : String(error)}`,
          3,
        );
      }
      lastError = error;
      await sleep(500 * attempt);
    }
  }

  throw lastError instanceof EvalError
    ? lastError
    : new EvalError('模型接口请求失败。', 3);
}

function extractMessageContent(data) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('')
      .trim();
    if (text) return text;
  }
  throw new EvalError(
    `无法从模型响应中读取 content：${truncate(JSON.stringify(data), 300)}`,
    3,
  );
}

async function judgeWithCatalog(query, skill, config, options) {
  const messages = [
    { role: 'system', content: buildCatalogPrompt(skill) },
    { role: 'user', content: query },
  ];
  const content = await callChatCompletion(config, messages, options);
  const parsed = parseJudgeResponse(content);
  return {
    triggered: parsed.useSkill === true,
    selectedSkill: parsed.skill,
    reason: parsed.reason,
  };
}

// ---------------------------------------------------------------------------
// claude / codex provider
// ---------------------------------------------------------------------------

export function triggerDetectorFor(provider, customPattern) {
  if (customPattern instanceof RegExp) return customPattern;
  if (provider === 'claude') {
    return /"name"\s*:\s*"Skill"[\s\S]{0,500}?"skill"\s*:\s*"daily-hot-api"|daily-hot-api\/SKILL\.md/i;
  }
  return /daily-hot-api\/SKILL\.md|"skill"\s*:\s*"daily-hot-api"/i;
}

function commandFor(provider, query, workspace) {
  if (provider === 'claude') {
    return {
      command: 'claude',
      args: ['-p', query, '--output-format', 'stream-json', '--verbose'],
      cwd: workspace,
    };
  }
  if (provider === 'codex') {
    return {
      command: 'codex',
      args: ['exec', '--json', '--skip-git-repo-check', query],
      cwd: workspace,
    };
  }
  throw new EvalError(`未知 provider：${provider}`);
}

async function prepareAgentWorkspace(provider, skill) {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), `dha-trigger-eval-${provider}-`),
  );
  const container =
    provider === 'claude'
      ? path.join(workspace, '.claude', 'skills')
      : path.join(workspace, '.agents', 'skills');
  const target = path.join(container, skill.name);
  await cp(skill.dir, target, { recursive: true });
  return { workspace, skillPath: path.join(target, 'SKILL.md') };
}

function runCommand(command, args, options) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, IS_WINDOWS ? args.map(quoteWindowsArg) : args, {
        cwd: options.cwd,
        env: { ...process.env, DISABLE_TELEMETRY: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: IS_WINDOWS,
        windowsHide: true,
      });
    } catch (error) {
      resolve({ error, code: null, stdout: '', stderr: '', timedOut: false });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ error, code: null, stdout, stderr, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ error: null, code, stdout, stderr, timedOut });
    });
  });
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function judgeWithAgent(query, skill, provider, detector, options) {
  const { workspace } = await prepareAgentWorkspace(provider, skill);
  try {
    const { command, args, cwd } = commandFor(provider, query, workspace);
    const result = await runCommand(command, args, {
      cwd,
      timeoutMs: options.agentTimeoutMs,
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    detector.lastIndex = 0;
    const triggered = detector.test(combined);
    const error = result.error
      ? `无法执行 ${command}：${result.error.message}`
      : result.timedOut
        ? `${command} 执行超时`
        : result.code !== 0 && !triggered
          ? `${command} 退出码 ${result.code}：${truncate(result.stderr || result.stdout, 300)}`
          : undefined;
    return {
      triggered,
      selectedSkill: triggered ? skill.name : null,
      reason: error ? '' : `agent 输出${triggered ? '命中' : '未命中'}触发模式`,
      error,
    };
  } finally {
    if (!options.keepWorkspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// 评测执行与汇总
// ---------------------------------------------------------------------------

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runner()),
  );
  return results;
}

export function summarize(queries, resultsById, options) {
  const queryResults = queries.map((query) => {
    const runs = resultsById.get(query.id) ?? [];
    const errorCount = runs.filter((run) => run.error).length;
    const triggerCount = runs.filter((run) => run.triggered).length;
    const triggerRate = runs.length === 0 ? 0 : triggerCount / runs.length;
    const predicted = triggerRate >= options.triggerRate;
    return {
      id: query.id,
      query: query.query,
      shouldTrigger: query.shouldTrigger,
      category: query.category,
      runs: runs.length,
      triggerCount,
      errorCount,
      triggerRate: round(triggerRate),
      predicted,
      pass: predicted === query.shouldTrigger,
      reasons: uniqueReasons(runs),
    };
  });

  const positives = queryResults.filter((item) => item.shouldTrigger);
  const negatives = queryResults.filter((item) => !item.shouldTrigger);
  const recall =
    positives.length === 0
      ? 1
      : positives.filter((item) => item.predicted).length / positives.length;
  const specificity =
    negatives.length === 0
      ? 1
      : negatives.filter((item) => !item.predicted).length / negatives.length;
  const totalErrors = queryResults.reduce(
    (sum, item) => sum + item.errorCount,
    0,
  );
  const passed =
    recall >= options.minPositive &&
    specificity >= options.minNegative &&
    totalErrors <= options.maxErrors;

  return {
    passed,
    recall: round(recall),
    specificity: round(specificity),
    accuracy: round(
      queryResults.filter((item) => item.pass).length / queryResults.length,
    ),
    totalRuns: queryResults.reduce((sum, item) => sum + item.runs, 0),
    totalErrors,
    falsePositives: queryResults
      .filter((item) => !item.shouldTrigger && item.predicted)
      .map((item) => item.id),
    falseNegatives: queryResults
      .filter((item) => item.shouldTrigger && !item.predicted)
      .map((item) => item.id),
    queries: queryResults,
  };
}

function uniqueReasons(runs) {
  const reasons = new Set();
  for (const run of runs) {
    if (run.reason) reasons.add(truncate(run.reason, 160));
    if (reasons.size >= 3) break;
  }
  return [...reasons];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

async function runEvaluation(options) {
  const skill = await readSkill(options.skillDir);
  const rawDataset = await loadDataset(options.dataset);
  const dataset = validateDataset(rawDataset, {
    allowSmall: options.allowSmall,
  });

  if (rawDataset.skill && rawDataset.skill !== skill.name) {
    throw new EvalError(
      `评测集 skill=${rawDataset.skill} 与 SKILL.md name=${skill.name} 不一致。`,
      3,
    );
  }

  if (options.dryRun) {
    const described = describeCatalogConfig(options);
    return {
      dryRun: true,
      skill: { name: skill.name, version: skill.version },
      provider: options.provider,
      model: described.model,
      baseUrl: described.baseUrl,
      hasApiKey: described.hasApiKey,
      dataset: {
        path: options.dataset,
        total: dataset.total,
        positives: dataset.positives,
        negatives: dataset.negatives,
      },
      runs: options.runs,
      concurrency: options.concurrency,
      thresholds: {
        triggerRate: options.triggerRate,
        minPositive: options.minPositive,
        minNegative: options.minNegative,
        maxErrors: options.maxErrors,
      },
    };
  }

  const catalogConfig =
    options.provider === 'catalog' ? resolveCatalogConfig(options) : null;
  const detector =
    options.provider === 'catalog'
      ? null
      : triggerDetectorFor(options.provider, options.triggerPattern);

  process.stderr.write(
    `[trigger-eval] provider=${options.provider} runs=${options.runs} ` +
      `queries=${dataset.total} (${dataset.positives}+/${dataset.negatives}-) concurrency=${options.concurrency}\n`,
  );

  const jobs = [];
  for (const query of dataset.queries) {
    for (let run = 1; run <= options.runs; run += 1) {
      jobs.push({ query, run });
    }
  }

  let finished = 0;
  const flatResults = await mapWithConcurrency(
    jobs,
    options.concurrency,
    async (job) => {
      let result;
      if (options.provider === 'catalog') {
        try {
          result = await judgeWithCatalog(
            job.query.query,
            skill,
            catalogConfig,
            options,
          );
        } catch (error) {
          result = {
            triggered: false,
            selectedSkill: null,
            reason: '',
            error:
              error instanceof EvalError
                ? `catalog 判定失败：${error.message}`
                : `catalog 判定失败：${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else {
        result = await judgeWithAgent(
          job.query.query,
          skill,
          options.provider,
          detector,
          options,
        );
      }
      finished += 1;
      if (options.verbose) {
        process.stderr.write(
          `[trigger-eval] ${finished}/${jobs.length} ${job.query.id} run#${job.run} ` +
            `triggered=${result.triggered}${result.error ? ` error=${truncate(result.error, 120)}` : ''}\n`,
        );
      }
      return { queryId: job.query.id, run: job.run, ...result };
    },
  );

  const resultsById = new Map();
  for (const result of flatResults) {
    const list = resultsById.get(result.queryId) ?? [];
    list.push(result);
    resultsById.set(result.queryId, list);
  }

  const summary = summarize(dataset.queries, resultsById, options);
  const report = {
    skill: {
      name: skill.name,
      version: skill.version,
      descriptionLength: skill.description.length,
    },
    provider: options.provider,
    model: catalogConfig?.model ?? null,
    baseUrl: catalogConfig?.baseUrl ?? null,
    dataset: {
      path: path.relative(REPO_ROOT, options.dataset) || options.dataset,
      total: dataset.total,
      positives: dataset.positives,
      negatives: dataset.negatives,
    },
    runs: options.runs,
    thresholds: {
      triggerRate: options.triggerRate,
      minPositive: options.minPositive,
      minNegative: options.minNegative,
      maxErrors: options.maxErrors,
    },
    ...summary,
  };

  if (options.jsonOut) {
    await writeFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (options.report) {
    await writeFile(options.report, toMarkdown(report), 'utf8');
  }
  return report;
}

export function toMarkdown(report) {
  const rows = report.queries.map((item) => {
    const expected = item.shouldTrigger ? '触发' : '不触发';
    const actual = item.predicted ? '触发' : '不触发';
    const mark = item.pass ? '✅' : '❌';
    const reasons = item.reasons.length > 0 ? item.reasons.join('<br>') : '';
    return `| ${mark} | ${item.id} | ${escapeTableCell(item.query)} | ${expected} | ${actual} | ${item.triggerRate} | ${reasons} |`;
  });

  return `# daily-hot-api 触发评测报告

- Skill: \`${report.skill.name}\` v${report.skill.version ?? 'unknown'}（description ${report.skill.descriptionLength} 字符）
- Provider: \`${report.provider}\`${report.model ? ` / model \`${report.model}\`` : ''}
- 每个 query 运行 ${report.runs} 次；触发率阈值 ${report.thresholds.triggerRate}
- 评测集：${report.dataset.total} 条（${report.dataset.positives} 正 / ${report.dataset.negatives} 负）
- 结果：**${report.passed ? '通过' : '未通过'}**

| 指标 | 值 | 阈值 |
| --- | --- | --- |
| 正样本召回 | ${report.recall} | ≥ ${report.thresholds.minPositive} |
| 负样本特异度 | ${report.specificity} | ≥ ${report.thresholds.minNegative} |
| 总准确率 | ${report.accuracy} | — |
| 运行错误数 | ${report.totalErrors} | ≤ ${report.thresholds.maxErrors} |

${report.falsePositives.length > 0 ? `误触发：${report.falsePositives.join(', ')}\n` : ''}${report.falseNegatives.length > 0 ? `漏触发：${report.falseNegatives.join(', ')}\n` : ''}

## 明细

| 结果 | id | query | 预期 | 实际 | 触发率 | 模型理由（去重） |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

function escapeTableCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `[trigger-eval] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof EvalError ? error.exitCode : 2;
    return;
  }

  if (options.help) {
    console.log(helpText());
    return;
  }

  try {
    const report = await runEvaluation(options);
    console.log(JSON.stringify(report, null, 2));
    if (report.dryRun) return;
    process.stderr.write(
      `[trigger-eval] ${report.passed ? 'PASS' : 'FAIL'} ` +
        `recall=${report.recall} specificity=${report.specificity} accuracy=${report.accuracy} errors=${report.totalErrors}\n`,
    );
    if (!report.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `[trigger-eval] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof EvalError ? error.exitCode : 3;
  }
}

const isEntry =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  await main();
}

export {
  EvalError,
  parseArgs,
  resolveCatalogConfig,
  callChatCompletion,
  runEvaluation,
  helpText,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value, length) {
  const text = String(value ?? '');
  return text.length <= length ? text : `${text.slice(0, length)}…`;
}
