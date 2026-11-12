#!/usr/bin/env node
/**
 * daily-hot-api Agent Skill 入口脚本。
 *
 * 设计目标：
 *   - stdout 只输出 JSON，诊断写 stderr，方便 agent 消费；
 *   - 全程非交互、幂等、可重复执行；
 *   - 查询结果做上下文瘦身（默认 10 条、desc 截断），避免把原始榜单灌进上下文；
 *   - 生命周期只管理“本 skill 启动”的实例，不动用户自己启动的服务。
 *
 * 详细契约见 references/api.md 与 SKILL.md。
 */

import { pathToFileURL } from 'node:url';

import { detectCli, nodeVersionInfo } from './lib/cli.mjs';
import {
  EXIT_CODES,
  SkillError,
  usageError,
} from './lib/errors.mjs';
import { requestJson, truncate } from './lib/http.mjs';
import {
  ensureService,
  inspectService,
  resolveSkillHome,
  stopSkillService,
} from './lib/service.mjs';

const SKILL_VERSION = '1.1.1';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_DESC_CHARS = 160;
const MAX_BRIEF_MARKDOWN_CHARS = 6_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SOURCE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;
/** 来源专属参数的 key：服务端 DTO 含 pageSize 这类驼峰字段。 */
const PARAM_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;

const VALUE_OPTIONS = new Set([
  '--base-url',
  '--limit',
  '--source',
  '--keyword',
  '--start',
  '--end',
  '--page',
  '--sort-by',
  '--sort-order',
  '--period',
  '--date',
  '--type',
  '--param',
]);

const FLAG_OPTIONS = new Set([
  '--help',
  '-h',
  '--version',
  '-v',
  '--full',
  '--no-cache',
  '--json',
]);

const COMMANDS = new Set([
  'help',
  'doctor',
  'ensure',
  'status',
  'sources',
  'hot',
  'history',
  'brief',
  'stop',
]);

function helpText() {
  return `daily-hot-api agent skill v${SKILL_VERSION}

用法:
  node scripts/daily-hot.mjs <command> [options]

命令:
  doctor                      检查 Node/CLI/服务实例状态，不启动服务
  ensure                      确保有可用实例（必要时自动后台启动隔离实例）
  status                      查看实例来源与 health/ready（未运行时退出码 5）
  sources                     列出所有热榜来源
  hot <source> [options]      获取实时热榜（默认 10 条，desc 截断）
  history search [options]    搜索历史热点（需要 Mongo，自建/远程实例才可用）
  brief [latest|YYYY-MM-DD]   读取已生成的 AI 每日简报（只读，不触发生成）
  stop                        停止“由本 skill 启动”的实例（幂等）

通用选项:
  --base-url <url>            连接已有实例，例如 http://127.0.0.1:6689
  --full                      返回完整原始数据（hot/brief）
  --json                      兼容占位，输出本来就是 JSON
  -h, --help                  查看帮助
  -v, --version               查看 skill 版本

hot 选项:
  --limit <n>                 条数，1-100，默认 ${DEFAULT_LIMIT}
  --type <name>               部分来源支持的类型
  --param key=value           来源专属参数，可重复（key 支持驼峰，如 pageSize）。
                              例如 nytimes: --param area=china；weatheralarm: --param province=北京；
                              hupu: --param page=2 --param pageSize=10
  --no-cache                  跳过缓存（受 NOT_ALLOWED_REFRESH_SOURCE 限制，慎用）

history 选项:
  --source <name>             来源 ID
  --keyword <text>            标题/描述关键词，最多 100 字符
  --start <YYYY-MM-DD>        开始日期
  --end <YYYY-MM-DD>          结束日期
  --page <n>                  页码，默认 1
  --limit <n>                 每页条数，1-100，默认 20
  --sort-by <field>           timestamp | title | createdAt
  --sort-order <asc|desc>     默认 desc

brief 选项:
  --date <YYYY-MM-DD>         指定日期，缺省取最新
  --period <name>             默认 daily

环境变量:
  DAILY_HOT_API_BASE_URL      连接已有实例（优先级最高）
  DAILY_HOT_API_SKILL_HOME    本 skill 隔离状态目录，默认 ~/.daily-hot-api-skill
  DAILY_HOT_API_CLI           指定 daily-hot-api 可执行文件路径

退出码:
  0 成功；2 用法错误；3 前置条件不满足；4 服务/上游失败；5 服务未运行

示例:
  node scripts/daily-hot.mjs doctor
  node scripts/daily-hot.mjs hot zhihu --limit 10
  node scripts/daily-hot.mjs hot weibo --type hot
  node scripts/daily-hot.mjs history search --source zhihu --keyword AI --start 2026-10-01
  node scripts/daily-hot.mjs brief latest
  node scripts/daily-hot.mjs stop`;
}

function parseArgv(argv) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('-')) {
      const [name, inlineValue] = splitInline(arg);
      if (FLAG_OPTIONS.has(name)) {
        if (inlineValue !== undefined) {
          throw usageError(`选项 ${name} 不接受值。`);
        }
        options[flagKey(name)] = true;
        continue;
      }
      if (VALUE_OPTIONS.has(name)) {
        const value = inlineValue ?? argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
          throw usageError(`选项 ${name} 需要一个值。`);
        }
        if (inlineValue === undefined) index += 1;
        const key = valueKey(name);
        if (key === 'param') {
          options.params = [...(options.params ?? []), value];
        } else {
          options[key] = value;
        }
        continue;
      }
      throw usageError(`未知选项：${arg}（运行 --help 查看支持的命令）`);
    }
    positionals.push(arg);
  }

  return { options, positionals };
}

function splitInline(arg) {
  const eq = arg.indexOf('=');
  if (eq === -1) return [arg, undefined];
  return [arg.slice(0, eq), arg.slice(eq + 1)];
}

function flagKey(name) {
  if (name === '-h') return 'help';
  if (name === '--help') return 'help';
  if (name === '-v') return 'version';
  if (name === '--version') return 'version';
  return name.replace(/^--/u, '').replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
}

function valueKey(name) {
  return name
    .replace(/^--/u, '')
    .replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
}

function parseLimit(raw, fallback) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw usageError(`limit 必须是 1-${MAX_LIMIT} 的整数。`);
  }
  return value;
}

function parsePage(raw) {
  if (raw === undefined) return 1;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw usageError('page 必须是 >= 1 的整数。');
  }
  return value;
}

function validateDate(value, label) {
  if (!ISO_DATE.test(value)) {
    throw usageError(`${label} 必须是 YYYY-MM-DD 格式。`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw usageError(`${label} 不是合法日期：${value}`);
  }
  return value;
}

function parseSource(raw) {
  if (!raw) throw usageError('hot 命令需要 source，例如：hot zhihu');
  if (!SOURCE_NAME.test(raw)) {
    throw usageError(`source 不合法：${raw}。可先运行 sources 查看可用 ID。`);
  }
  return raw;
}

function truncatedDesc(desc) {
  if (typeof desc !== 'string' || !desc.trim()) return undefined;
  return truncate(desc.trim(), MAX_DESC_CHARS);
}

function normalizeHot(raw, { full } = {}) {
  if (full) return raw;
  const data = Array.isArray(raw?.data) ? raw.data : [];
  return {
    source: raw?.name ?? raw?.source,
    title: raw?.title,
    type: raw?.type,
    link: raw?.link,
    fromCache: raw?.fromCache,
    updatedAt: raw?.updateTime,
    total: data.length,
    items: data.map((item, index) => {
      const normalized = {
        rank: index + 1,
        title: item?.title,
        hot: item?.hot,
        url: item?.url ?? item?.mobileUrl,
      };
      const desc = truncatedDesc(item?.desc);
      if (desc) normalized.desc = desc;
      return normalized;
    }),
  };
}

function normalizeHistory(raw) {
  const data = Array.isArray(raw?.data) ? raw.data : [];
  return {
    total: raw?.total,
    page: raw?.page,
    limit: raw?.limit,
    totalPages: raw?.totalPages,
    items: data.map((item, index) => {
      const normalized = {
        rank: index + 1,
        source: item?.source,
        title: item?.title,
        hot: item?.hot,
        url: item?.url ?? item?.mobileUrl,
        timestamp: item?.timestamp,
      };
      const desc = truncatedDesc(item?.desc);
      if (desc) normalized.desc = desc;
      return normalized;
    }),
  };
}

function normalizeBrief(raw, { full } = {}) {
  if (!raw) {
    return {
      found: false,
      message:
        '还没有成功生成的每日简报。简报需要 MongoDB、AI Key 与已生成的记录；可连接一个已配置简报的自建实例。',
    };
  }
  const analysis =
    raw.analysis && typeof raw.analysis === 'object' ? raw.analysis : {};
  const markdown =
    typeof raw.markdown === 'string'
      ? full
        ? raw.markdown
        : truncate(raw.markdown, MAX_BRIEF_MARKDOWN_CHARS)
      : undefined;
  const result = {
    found: true,
    briefDate: raw.briefDate,
    period: raw.period,
    status: raw.status,
    sources: raw.sources,
    updatedAt: raw.updatedAt ?? raw.createdAt,
    summary: analysis.summary,
    highlights: analysis.highlights,
    topicCount: Array.isArray(analysis.topics)
      ? analysis.topics.length
      : undefined,
    markdown,
    model: raw.model,
    tavilyUsed: raw.tavilyUsed,
  };
  // 简报可能处于 generating/failed：内容不完整，必须让 agent 知道别当成结果。
  if (raw.status && raw.status !== 'success') {
    result.note =
      raw.status === 'generating'
        ? '这份简报正在生成中，内容可能不完整；稍后重新读取。'
        : `这份简报状态为 ${raw.status}，内容可能缺失；需要重新生成（由用户自行发起）。`;
  }
  return result;
}

/**
 * 只在 /ready 明确返回 503 时拦截。
 *
 * `status: null` 表示探测本身失败（超时/连接错误），不能据此断言 Mongo 未连接；
 * 那种情况放过去，让真正的接口错误给出准确原因。
 */
function assertMongoReady(service, operation) {
  if (service.ready?.ready === false && service.ready.status === 503) {
    throw new SkillError(
      `当前实例的 MongoDB 未连接（/ready 503），无法${operation}。实时热榜仍可用；请用 DAILY_HOT_API_BASE_URL 连接一个已配置 MONGODB_URI 的自建实例。`,
      {
        exitCode: EXIT_CODES.SERVICE,
        code: 'mongo_unavailable',
        details: { baseUrl: service.baseUrl },
      },
    );
  }
}

function attachMongoHint(error) {
  const status = error?.details?.status;
  if (status === 500 || status === 503) {
    error.message +=
      '\n提示：历史查询/简报依赖 MongoDB。自动启动的隔离实例不连 Mongo；请用 DAILY_HOT_API_BASE_URL 连接一个已配置 MongoDB 的自建实例。';
  }
  return error;
}

async function tryGetJson(baseUrl, path) {
  try {
    return await requestJson(baseUrl, path, { timeoutMs: 5_000 });
  } catch {
    return null;
  }
}

async function commandDoctor(options) {
  const node = nodeVersionInfo();
  const skillHome = resolveSkillHome();

  let cli;
  try {
    cli = await detectCli();
  } catch (error) {
    cli = { error: error instanceof Error ? error.message : String(error) };
  }

  let service = null;
  try {
    service = await inspectService({ baseUrl: options.baseUrl });
  } catch (error) {
    service = {
      found: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const suggestions = [];
  if (!node.supported) {
    suggestions.push(`升级 Node.js 到 >= ${node.minimum}（推荐 24 LTS）。`);
  } else if (!node.recommended && node.note) {
    suggestions.push(node.note);
  }
  if (cli.kind === 'npx') suggestions.push(cli.note);
  if (!service?.found) {
    suggestions.push(
      '运行 `node scripts/daily-hot.mjs ensure` 启动隔离实例，或设置 DAILY_HOT_API_BASE_URL 连接已部署实例。',
    );
  } else if (!service.ready?.ready) {
    suggestions.push(
      'MongoDB 未连接（/ready 非 200）：实时热榜可用；历史与简报需要自建实例并配置 MONGODB_URI。',
    );
  }

  let brief = null;
  if (service?.found) {
    brief = await tryGetJson(service.baseUrl, '/api/briefs/config');
  }

  const blocking = !node.supported;
  const degraded = !service?.found || !service?.ready?.ready;
  return {
    status: blocking ? 'blocked' : degraded ? 'degraded' : 'ok',
    node,
    platform: { os: process.platform, arch: process.arch },
    skillHome,
    cli,
    service: service?.found
      ? {
          found: true,
          source: service.source,
          baseUrl: service.baseUrl,
          readOnly: service.readOnly,
          health: service.health,
          ready: service.ready,
        }
      : { found: false, error: service?.error },
    brief: brief
      ? { enabled: brief.enabled, available: Boolean(brief) }
      : { available: false },
    suggestions,
    exitCode: blocking ? EXIT_CODES.PREREQUISITE : EXIT_CODES.OK,
  };
}

async function commandEnsure(options) {
  const service = await ensureService({ baseUrl: options.baseUrl });
  return {
    ok: true,
    source: service.source,
    baseUrl: service.baseUrl,
    readOnly: service.readOnly,
    health: service.health,
    ready: service.ready,
    skillHome: resolveSkillHome(),
    ...(service.port ? { port: service.port } : {}),
    ...(service.cliVersion ? { cliVersion: service.cliVersion } : {}),
  };
}

async function commandStatus(options) {
  const service = await inspectService({ baseUrl: options.baseUrl });
  if (!service.found) {
    return {
      running: false,
      skillHome: resolveSkillHome(),
      message:
        '未找到可用的 daily-hot-api 实例。可运行 ensure 启动隔离实例，或设置 DAILY_HOT_API_BASE_URL。',
      exitCode: EXIT_CODES.NOT_RUNNING,
    };
  }
  return {
    running: true,
    source: service.source,
    baseUrl: service.baseUrl,
    readOnly: service.readOnly,
    health: service.health,
    ready: service.ready,
    skillHome: resolveSkillHome(),
  };
}

async function commandSources(options) {
  const service = await ensureService({ baseUrl: options.baseUrl });
  const raw = await requestJson(service.baseUrl, '/hot-lists/all', {
    timeoutMs: 10_000,
  });
  const routes = Array.isArray(raw?.routes) ? raw.routes : [];
  return {
    baseUrl: service.baseUrl,
    sourceOfService: service.source,
    count: raw?.count ?? routes.length,
    sources: routes.map((route) => ({
      name: route?.name,
      title: route?.title,
      path: route?.path,
    })),
  };
}

/**
 * 组装 /hot-lists/:source 的查询参数。
 *
 * 必须在连服务之前调用：用法错误不该让用户先等一次 npx 下载 + 服务启动。
 */
function buildHotQuery(options) {
  const query = { limit: parseLimit(options.limit, DEFAULT_LIMIT) };
  if (options.type) query.type = options.type;
  if (options.noCache) query.noCache = 'true';

  const reserved = new Set(['limit', 'type', 'noCache', 'rss']);
  for (const param of options.params ?? []) {
    const separator = param.indexOf('=');
    if (separator <= 0) {
      throw usageError(`--param 需要 key=value 形式：${param}`);
    }
    const key = param.slice(0, separator);
    const value = param.slice(separator + 1);
    // 服务端的 DTO 里有 pageSize / cursor 这类驼峰参数，不能只允许小写。
    if (!PARAM_KEY.test(key)) {
      throw usageError(
        `--param 的 key 不合法：${key}（只允许字母开头的字母/数字/_/-）`,
      );
    }
    if (reserved.has(key)) {
      throw usageError(`--param 不能覆盖保留参数：${key}，请用专用选项。`);
    }
    query[key] = value;
  }
  return query;
}

async function commandHot(options, positionals) {
  const source = parseSource(positionals[1]);
  const query = buildHotQuery(options);
  const service = await ensureService({ baseUrl: options.baseUrl });

  const raw = await requestJson(
    service.baseUrl,
    `/hot-lists/${encodeURIComponent(source)}`,
    { query, timeoutMs: 30_000 },
  );

  return {
    baseUrl: service.baseUrl,
    sourceOfService: service.source,
    ...normalizeHot(raw, { full: Boolean(options.full) }),
  };
}

async function commandHistory(options, positionals) {
  const subcommand = positionals[1];
  if (subcommand && subcommand !== 'search') {
    throw usageError(
      `history 只支持 search 子命令，收到：${subcommand}（例如：history search --source zhihu）`,
    );
  }

  const limit = parseLimit(options.limit, 20);
  const page = parsePage(options.page);
  const query = { page, limit };
  // 下面这些校验都在 ensureService 之前完成，理由同 buildHotQuery。
  if (options.source) query.source = options.source;
  if (options.keyword) {
    if (options.keyword.length > 100) {
      throw usageError('keyword 最多 100 个字符。');
    }
    query.keyword = options.keyword;
  }
  if (options.start) query.startDate = validateDate(options.start, 'start');
  if (options.end) query.endDate = validateDate(options.end, 'end');
  if (options.sortBy) query.sortBy = options.sortBy;
  if (options.sortOrder) query.sortOrder = options.sortOrder;

  const service = await ensureService({ baseUrl: options.baseUrl });
  assertMongoReady(service, '查询历史热点');
  let raw;
  try {
    raw = await requestJson(service.baseUrl, '/api/history/search', {
      query,
      timeoutMs: 20_000,
    });
  } catch (error) {
    throw attachMongoHint(error);
  }

  return {
    baseUrl: service.baseUrl,
    sourceOfService: service.source,
    ...normalizeHistory(raw),
  };
}

async function commandBrief(options, positionals) {
  const target = positionals[1] ?? 'latest';
  let path = '/api/briefs/latest';
  let date;

  if (target !== 'latest') {
    if (options.date) {
      throw usageError('brief 已在位置参数给了日期，不要再传 --date。');
    }
    date = validateDate(target, 'brief date');
  } else if (options.date) {
    date = validateDate(options.date, '--date');
  }
  if (date) path = `/api/briefs/${date}`;

  const query = {};
  if (options.period) query.period = options.period;

  const service = await ensureService({ baseUrl: options.baseUrl });
  assertMongoReady(service, '读取每日简报');
  let raw;
  try {
    raw = await requestJson(service.baseUrl, path, { query, timeoutMs: 10_000 });
  } catch (error) {
    throw attachMongoHint(error);
  }

  return {
    baseUrl: service.baseUrl,
    sourceOfService: service.source,
    ...normalizeBrief(raw, { full: Boolean(options.full) }),
  };
}

async function commandStop() {
  const result = await stopSkillService();
  return result;
}

async function dispatch(argv) {
  const { options, positionals } = parseArgv(argv);

  if (options.help) {
    console.log(helpText());
    return { exitCode: EXIT_CODES.OK };
  }
  if (options.version) {
    console.log(`daily-hot-api-skill ${SKILL_VERSION}`);
    return { exitCode: EXIT_CODES.OK };
  }

  const command = positionals[0] ?? 'help';
  if (!COMMANDS.has(command)) {
    throw usageError(`未知命令：${command}（运行 --help 查看支持的命令）`);
  }
  if (command === 'help') {
    console.log(helpText());
    return { exitCode: EXIT_CODES.OK };
  }

  let result;
  switch (command) {
    case 'doctor':
      result = await commandDoctor(options);
      break;
    case 'ensure':
      result = await commandEnsure(options);
      break;
    case 'status':
      result = await commandStatus(options);
      break;
    case 'sources':
      result = await commandSources(options);
      break;
    case 'hot':
      result = await commandHot(options, positionals);
      break;
    case 'history':
      result = await commandHistory(options, positionals);
      break;
    case 'brief':
      result = await commandBrief(options, positionals);
      break;
    case 'stop':
      result = await commandStop();
      break;
    default:
      throw usageError(`未实现的命令：${command}`);
  }

  console.log(JSON.stringify(result, null, 2));
  return { exitCode: result?.exitCode ?? EXIT_CODES.OK };
}

async function main() {
  try {
    const { exitCode } = await dispatch(process.argv.slice(2));
    process.exitCode = exitCode;
  } catch (error) {
    if (error instanceof SkillError) {
      console.error(`[daily-hot-api skill] 错误：${error.message}`);
      if (error.details && Object.keys(error.details).length > 0) {
        const compact = JSON.stringify(error.details, null, 2);
        console.error(`详情：${truncate(compact, 2_000)}`);
      }
      process.exitCode = error.exitCode ?? 1;
      return;
    }
    console.error(
      `[daily-hot-api skill] 未预期错误：${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

// 便于测试直接 import 内部函数；仅当作为入口执行时才运行 main()。
const isEntry =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntry) {
  await main();
}

export {
  SKILL_VERSION,
  buildHotQuery,
  dispatch,
  normalizeHot,
  normalizeHistory,
  normalizeBrief,
  parseArgv,
  parseLimit,
  validateDate,
};
