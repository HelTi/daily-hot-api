# AGENTS.md

This file gives Codex and other coding agents project-specific guidance for `daily-hot-api`.

## Project Overview

`daily-hot-api` is a NestJS API service for aggregating hot lists from many sources, saving historical hot items to MongoDB, scheduling background fetches, and generating AI-powered daily briefs.

Core stack:

- Node.js >= 24（CI、Dockerfile、.nvmrc 一致；npm >= 11，lockfile 由 npm 11 生成）
- NestJS 11
- TypeScript
- MongoDB with Mongoose
- Redis cache
- OpenAI SDK-compatible AI endpoint
- Tavily Search API for brief search enrichment

## Important Directories

```text
bin/
  daily-hot-api.js        npm bin shim (requires dist/cli/index.js)
src/
  app.module.ts
  config/                 App configuration and validation
  cache/                  Redis-backed cache service
  database/               Mongoose schemas and repositories
  host-lists/             Hot list sources and source registry
  history/                Historical hot item query APIs
  scheduler/              Scheduled hot data fetch tasks
  daily-brief/            AI daily brief module
  cli/                    npm CLI: start/stop/status/restart/logs
  http/                   Shared HTTP client for source fetching
  token/                  Token/signature helpers for selected sources

docs/
  *.md                    Feature notes and maintenance context for future AI agents
  daily-brief.md          Daily brief backend/API documentation
  daily-brief-frontend.md Daily brief frontend display guidance
```

## Common Commands

```bash
npm run build
npx eslint "src/**/*.ts"
npm run format
npm run start:prod
npm run dev
```

Notes:

- `npm run lint` runs ESLint over `src` and `test`; the repository has had an existing e2e lint issue in `test/app.e2e-spec.ts`. Prefer `npx eslint "src/**/*.ts"` when validating source-only changes unless the task explicitly touches tests.
- `npm run format` formats all `src/**/*.ts` and `test/**/*.ts`.
- If a dev/prod server is already using the configured port, run temporary verification with a different port, for example:

```bash
PORT=6699 BRIEF_ENABLED=false npm run start:prod
```

CLI（先 `npm run build`，再用 `node bin/daily-hot-api.js` 等价于全局命令）：

```bash
node bin/daily-hot-api.js --help
node bin/daily-hot-api.js status
DAILY_HOT_API_HOME=/tmp/dha-home node bin/daily-hot-api.js start -d --port 6699 --config .env
DAILY_HOT_API_HOME=/tmp/dha-home node bin/daily-hot-api.js stop
```

## CLI（npm 包）

`package.json` 已配置为可发布的 CLI 包：npm 包名 `@ttkit/daily-hot-api`（scoped），bin 命令名 `daily-hot-api`，`files` 白名单（`bin/ dist/ views/ .env.example`）、`main: dist/main.js`、`publishConfig.access: public`、`publishConfig.registry: https://registry.npmjs.org/`、`prepublishOnly` 构建，并移除了 `private`。当前已发布 `0.1.2`。非 scoped 的 `daily-hot-api` 与 npm 上已有的 `dailyhotapi` 太相似而无法注册，不要改回；npm 若把首版/新版本放入 staged 队列，需要维护者在 npmjs.com 的 Staged Packages 页面用 2FA 审批。发布推荐 Trusted Publishing：`.github/workflows/publish.yml` 通过 GitHub Actions OIDC 发布（npm 包设置里的 Trusted Publisher 填写 `HelTi` / `daily-hot-api` / `publish.yml`，Allowed actions 勾选 `npm publish`），本地 token 发布仍可用。CLI 文档在 `docs/guide/cli.md`。

代码结构：

```text
bin/daily-hot-api.js       npm bin shim，require dist/cli/index.js 并调用 main()
src/cli/index.ts           命令分发 + main() 错误处理
src/cli/args.ts            参数解析、命令/选项兼容性校验
src/cli/help.ts            全局与各命令帮助文本
src/cli/paths.ts           包根目录、bin 路径、状态目录、配置文件解析
src/cli/env.ts             .env 合并（不覆盖已有环境变量）、端口解析
src/cli/run-state.ts       运行状态文件、PID/命令行校验、端口探测
src/cli/health.ts          /health 就绪探测
src/cli/log-file.ts        日志尾部读取与增量读取
src/cli/commands/          start / stop / status / restart / logs
```

行为约定：

- `daily-hot-api`（无参数）等价 `start`，在前台就地复用 `bootstrap()` 启动 Nest 应用；`start -d` 通过 `bin/daily-hot-api.js` 派生 detached 子进程，父进程轮询状态文件与 `/health`（最多 60 秒）后退出。
- `stop/status/restart` 依赖状态目录（默认 `~/.daily-hot-api`，`DAILY_HOT_API_HOME` / `--home` 可覆盖）中的 `daily-hot-api.json`；`logs` 只读 `<home>/logs/daily-hot-api.log`，不依赖状态文件。
- PID 通过 `ps` 校验是否仍是 daily-hot-api 进程，避免 PID 复用误杀；PS 不可用（Windows、受限沙箱）时退化为「存活即信任」。PID 存活但确认不属于本服务时，`stop` 会保留状态文件并提示用 `--force`，`status` 也保留状态文件；只有进程已退出或状态文件损坏时才自动清理。
- 后台日志写入 `<home>/logs/daily-hot-api.log`；前台模式标准输出到终端，不写日志文件。
- 配置优先级：`--config` > `DAILY_HOT_API_ENV_FILE` > `<cwd>/.env` > `<home>/.env`；端口优先级：`--port` > `PORT` > 6689。
- 不要使用 `--env-file`：Node.js 24 会抢先解析该参数（即使位于脚本路径之后），文件不存在时直接以退出码 9 失败。帮助和文档统一使用 `--config`，args 解析器保留 `--env-file` 作为兼容别名。
- `src/main.ts` 导出 `bootstrap()` 与 `resolveViewsDir()`，仅在 `require.main === module` 时自动启动，供 CLI 复用；模板目录优先从包根目录 `views/` 解析，兼容全局安装后在任意 cwd 运行，`cwd/views` 作为兜底。
- 退出码：`0` 成功、`1` 运行错误、`2` 用法错误、`3` status 未运行。
- 发布前：`npm run build`、`npm run pack:check`，确认 tarball 不含 `.env`、docs 缓存或测试文件；`prepublishOnly` 会自动构建。CLI 测试在 `src/cli/*.spec.ts`。

## Agent Skill（skills/daily-hot-api）

仓库内维护一个公开的 Agent Skill，供 Claude Code、Codex、Cursor、Copilot、OpenCode、OpenClaw 等宿主通过 `npx skills add HelTi/daily-hot-api` 安装。它包装已发布的 CLI，不修改 `src/` 业务代码。

结构：

```text
skills/daily-hot-api/
  SKILL.md                 # 只允许官方 6 个 frontmatter 字段；<500 行
  scripts/daily-hot.mjs    # 唯一入口：doctor/ensure/status/sources/hot/history/brief/stop
  scripts/lib/             # cli/http/service/errors，仅 Node 内置模块
  references/              # api/sources/history/daily-brief/remote-deploy/troubleshooting
test/skill/*.test.mjs      # node:test，mock HTTP，不依赖外网
evals/daily-hot-api/       # 触发评测集 + run-trigger-eval.mjs（catalog/claude/codex）
.github/workflows/skill-ci.yml
```

约定：

- skill 声明最低兼容 CLI 版本（`scripts/lib/cli.mjs` 的 `CLI_PIN` + `SKILL.md` metadata）：本地 CLI >= 该版本时复用，否则 npx 使用该精确版本，禁止 `@latest`；CLI 发版后 1 周内评估更新 pin、`compatibility`、references，并跑测试。
- 只读原则：skill 不调用 `POST /api/briefs/generate`、`DELETE`、`scheduler/*` 写接口；`stop` 只停自己启动的实例。
- 自动启动的隔离实例使用最小配置（不开简报、不连 Mongo，状态目录 `~/.daily-hot-api-skill`），不读取用户 cwd `.env`。
- 退出码与 CLI 不同：skill 用 `0/2/3/4/5`（5=未运行，CLI 的 3=未运行），改脚本时同步 `references/api.md` 与 `SKILL.md`。
- frontmatter 只写 `name/description/license/compatibility/metadata`（不要加自定义顶层字段）；`name` 必须与目录名一致。
- 修改 API 行为、热榜来源或 CLI 选项时，同步更新 `references/`、`docs/guide/agent-skill.md`、`docs/development/agent-skill.md` 和相关测试。
- 修改 `description` 后必须重跑触发评测：`node evals/daily-hot-api/run-trigger-eval.mjs --dry-run`（CI）；发布前用 catalog + 至少一个真实宿主各跑一次并达到阈值。
- 验证：`node --test test/skill/*.test.mjs`、`node evals/daily-hot-api/run-trigger-eval.mjs --dry-run`、`agentskills validate skills/daily-hot-api`、`npx -y skills@1.7.4 add . --list`。

## Configuration

Defaults and validation rules live only in `src/config/validation.schema.ts`. `src/config/configuration.ts` just parses `process.env` through that schema, so it needs no edit when adding a variable.

When adding a new environment variable, update:

- `src/config/validation.schema.ts`
- `.env.example`
- `docs/reference/environment-variables.md`

Daily brief code must not call `ConfigService` directly. Read settings through `DailyBriefConfigService` (`src/daily-brief/daily-brief.config.ts`), which uses `getOrThrow` so defaults live only in `validation.schema.ts`. When adding a daily brief variable, add a typed getter there too.

Daily brief variables:

```bash
BRIEF_ENABLED=true
BRIEF_CRON_EXPRESSION=0 12 * * *
BRIEF_TIMEZONE=Asia/Shanghai
BRIEF_SOURCES=cls,yicai,wallstreet,jin10,tonghuashun,eastmoney,gelonghui
BRIEF_LOOKBACK_HOURS=24
BRIEF_TOP_ITEMS_PER_SOURCE=10
BRIEF_MAX_TOPICS=12
BRIEF_GENERATING_TIMEOUT_MINUTES=30
BRIEF_SOURCE_CONCURRENCY=3
BRIEF_SEARCH_CONCURRENCY=3

OPENAI_API_KEY=skxxx
OPENAI_API_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
AI_TIMEOUT_MS=120000
AI_MAX_RETRIES=2

TAVILY_API_KEY=tvly-dev-xxx
TAVILY_MAX_RESULTS=5
TAVILY_TIMEOUT_MS=10000
```

Do not print real API keys from `.env` in final responses or logs.

## Daily Brief Module

The daily brief feature lives in `src/daily-brief`.

Key files:

```text
src/daily-brief/daily-brief.module.ts
src/daily-brief/daily-brief.controller.ts
src/daily-brief/daily-brief.service.ts
src/daily-brief/daily-brief.scheduler.ts
src/daily-brief/daily-brief.config.ts
src/daily-brief/utils/brief-date.ts
src/daily-brief/utils/concurrency.ts
src/daily-brief/clients/ai-analysis.client.ts
src/daily-brief/clients/tavily-search.client.ts
src/daily-brief/interfaces/daily-brief.interface.ts
src/daily-brief/dto/generate-brief.dto.ts
src/database/schemas/daily-brief.schema.ts
src/database/repositories/daily-brief.repository.ts
```

Behavior:

- Reads configured sources from `BRIEF_SOURCES`.
- Refreshes configured hot list sources through `FetchHotDataTask`, so a source disabled in `source_configs` is skipped and only logged as a warning. `BRIEF_SOURCES` alone does not enable a source.
- Saves fetched hot items to the existing history repository. Saved items are first-seen snapshots: `$setOnInsert` only, so `hot` / `title` / `timestamp` never change after the first write.
- Analyzes only the first `BRIEF_TOP_ITEMS_PER_SOURCE` items per source. Current default is 10.
- Uses Tavily to enrich up to `BRIEF_MAX_TOPICS` candidate topics, at most `BRIEF_SEARCH_CONCURRENCY` at a time. `PROMPT_BUDGET` in `src/daily-brief/clients/ai-analysis.client.ts` caps what reaches the model (60 items, 12 evidence blocks); `BRIEF_MAX_TOPICS` is validated against that cap, so raising it past 12 fails at startup instead of being truncated silently.
- Uses the OpenAI SDK with `OPENAI_API_BASE_URL` and `AI_MODEL`.
- All external calls are bounded: `TAVILY_TIMEOUT_MS` per search, `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` per analysis.
- Rejects an analysis without a summary or without topics, so an empty AI response is recorded as `failed` rather than `success`.
- A brief stuck in `generating` for longer than `BRIEF_GENERATING_TIMEOUT_MINUTES` is treated as stale and may be regenerated without `force`.
- `GET /api/briefs/config` reports `enabled` from the scheduler's live state, so it reflects `scheduler/start` and `scheduler/stop`.
- Saves generated briefs to MongoDB.
- Stores `rawInputItems` and `searchEvidence` for backend debugging, but does not return them by default.

Public brief APIs default to frontend-safe responses. Use `includeDebug=true` only for backend debugging:

```bash
GET /api/briefs/latest?includeDebug=true
GET /api/briefs/2026-07-05?period=daily&includeDebug=true
```

## Daily Brief API Summary

```text
POST   /api/briefs/generate
GET    /api/briefs/config
GET    /api/briefs/latest
GET    /api/briefs/:date
GET    /api/briefs
DELETE /api/briefs/:date
DELETE /api/briefs/history

GET    /api/briefs/scheduler/status
POST   /api/briefs/scheduler/start
POST   /api/briefs/scheduler/stop
POST   /api/briefs/scheduler/reconfigure
```

No endpoint has built-in authentication. `POST /api/briefs/generate` (spends AI and Tavily quota), both `DELETE` routes, and the `scheduler/*` routes are expected to be restricted at the reverse proxy / gateway layer. Do not add auth to these without asking the maintainer first.

Examples:

```bash
curl http://localhost:6689/api/briefs/config

curl -X POST http://localhost:6689/api/briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"sources":["cls"],"period":"manual-test","force":true}'

curl http://localhost:6689/api/briefs/latest

curl -X DELETE 'http://localhost:6689/api/briefs/history?olderThan=1m'
```

## Hot List Sources

Hot list sources live in `src/host-lists/sources`.

New sources should:

- Be an injectable provider.
- Use the `@HotSource` decorator.
- Implement `HotListSource`.
- Return data matching `HotListGetListResponse`.
- Be added to `HOT_LIST_SOURCES` in `src/host-lists/sources/index.ts`.

Source metadata is discovered by `HotListsService` using Nest `DiscoveryService`.

## Database Conventions

Schemas live in `src/database/schemas`.

Repositories live in `src/database/repositories`.

When adding a schema or repository:

1. Add the schema with `SchemaFactory.createForClass`.
2. Register it in `src/database/database.module.ts` via `MongooseModule.forFeature`.
3. Add and export the repository from `DatabaseModule`.

Daily brief collection has a unique index on `{ briefDate: 1, period: 1 }`.

Aggregation pipelines must stay MongoDB 6.0 compatible: the server and local development both run 6.0, and `docker-compose.yml` pins `mongo:6.0`. `src/database/repositories/mongo-compatibility.spec.ts` extracts every operator the pipelines emit, fails on anything introduced after 6.0, and also fails on any operator missing from its whitelist, so a new operator has to be confirmed as 6.0-available before it lands. Run it after touching any pipeline.

## Scheduler Notes

There are two scheduler areas:

- `src/scheduler`: hot data fetching. MongoDB backup is an external operation documented in `docs/operations/volumes.md`.
- `src/daily-brief/daily-brief.scheduler.ts`: AI daily brief generation.

Both use `SchedulerRegistry` and cron jobs.

Avoid adding another `ScheduleModule.forRoot()` unless necessary. If refactoring scheduler modules, ensure cron registration still works at app startup.

## Frontend Documentation

Use these docs when working on or discussing frontend integration:

- `docs/guide/daily-brief.md`
- `docs/development/daily-brief-frontend.md`

Frontend should not request `includeDebug=true` in normal user flows.

## Feature Documentation

When adding a new feature, update or create documentation under `docs/` in the same change. The documentation should make future AI maintenance and extension easier by recording:

- What the feature does and the user-facing/API behavior.
- Key files, modules, services, schemas, and repositories involved.
- Configuration or environment variables, including defaults.
- Data flow, scheduler behavior, external APIs, or persistence details when relevant.
- Verification steps, curl examples, and safe no-op checks for destructive routes.

If the feature changes an existing documented area, update the existing doc instead of creating a duplicate. If no suitable doc exists, create a focused `docs/<feature-name>.md`.

## Verification Checklist

For source changes:

```bash
npm run build
npx eslint "src/**/*.ts"
```

For daily brief route verification, after building:

```bash
PORT=6699 BRIEF_ENABLED=false npm run start:prod
curl http://localhost:6699/api/briefs/config
curl http://localhost:6699/api/briefs/latest
```

For CLI / npm packaging changes:

```bash
npm run build
npx eslint "src/**/*.ts"
npm test
node bin/daily-hot-api.js --help
npm run pack:check
```

For manual CLI lifecycle checks, use an isolated state directory and port so the developer's own instance is not touched:

```bash
DAILY_HOT_API_HOME=/tmp/dha-home node bin/daily-hot-api.js start -d --port 6791 --config .env
curl http://127.0.0.1:6791/health
DAILY_HOT_API_HOME=/tmp/dha-home node bin/daily-hot-api.js status
DAILY_HOT_API_HOME=/tmp/dha-home node bin/daily-hot-api.js stop
```

For destructive daily brief cleanup routes, prefer safe no-op checks first:

```bash
curl -X DELETE 'http://localhost:6699/api/briefs/1900-01-01?period=manual-test'
curl -X DELETE 'http://localhost:6699/api/briefs/history?beforeDate=1900-01-01'
```

Expected result should include `deletedCount: 0`.

## Editing Guidelines

- Keep changes scoped to the requested module.
- Use the existing NestJS module/service/controller/repository pattern.
- Update docs when changing API behavior or adding features.
- Update `.env.example` when adding or changing environment variables.
- Avoid returning large debug fields to frontend-facing APIs by default.
- Preserve user changes in a dirty worktree; do not revert unrelated edits.
- Keep npm publish metadata in sync when touching `package.json`: `bin`, `files`, `main`, `version`, and `publishConfig`. `files` must keep `views/` for the CLI to render `/` when installed globally.
- When changing CLI behavior or options, update `docs/guide/cli.md`, the help text in `src/cli/help.ts`, and the CLI section in this file together.
