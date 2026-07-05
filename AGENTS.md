# AGENTS.md

This file gives Codex and other coding agents project-specific guidance for `daily-hot-api`.

## Project Overview

`daily-hot-api` is a NestJS API service for aggregating hot lists from many sources, saving historical hot items to MongoDB, scheduling background fetches, and generating AI-powered daily briefs.

Core stack:

- Node.js >= 20
- NestJS 11
- TypeScript
- MongoDB with Mongoose
- Redis cache
- OpenAI SDK-compatible AI endpoint
- Tavily Search API for brief search enrichment

## Important Directories

```text
src/
  app.module.ts
  config/                 App configuration and validation
  cache/                  Redis-backed cache service
  database/               Mongoose schemas and repositories
  host-lists/             Hot list sources and source registry
  history/                Historical hot item query APIs
  scheduler/              Scheduled hot data fetch tasks
  daily-brief/            AI daily brief module
  http/                   Shared HTTP client for source fetching
  token/                  Token/signature helpers for selected sources

docs/
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

## Configuration

Config is defined in:

- `src/config/configuration.ts`
- `src/config/validation.schema.ts`
- `.env.example`

When adding a new environment variable, update all three places.

Daily brief variables:

```bash
BRIEF_ENABLED=true
BRIEF_CRON_EXPRESSION=0 12 * * *
BRIEF_TIMEZONE=Asia/Shanghai
BRIEF_SOURCES=cls,yicai,wallstreet,jin10,tonghuashun,eastmoney,gelonghui
BRIEF_LOOKBACK_HOURS=24
BRIEF_TOP_ITEMS_PER_SOURCE=10
BRIEF_MAX_TOPICS=12

OPENAI_API_KEY=skxxx
OPENAI_API_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash

TAVILY_API_KEY=tvly-dev-xxx
TAVILY_MAX_RESULTS=5
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
src/daily-brief/clients/ai-analysis.client.ts
src/daily-brief/clients/tavily-search.client.ts
src/daily-brief/interfaces/daily-brief.interface.ts
src/daily-brief/dto/generate-brief.dto.ts
src/database/schemas/daily-brief.schema.ts
src/database/repositories/daily-brief.repository.ts
```

Behavior:

- Reads configured sources from `BRIEF_SOURCES`.
- Refreshes configured hot list sources before generating.
- Saves fetched hot items to the existing history repository.
- Analyzes only the first `BRIEF_TOP_ITEMS_PER_SOURCE` items per source. Current default is 10.
- Uses Tavily to enrich up to `BRIEF_MAX_TOPICS` candidate topics.
- Uses the OpenAI SDK with `OPENAI_API_BASE_URL` and `AI_MODEL`.
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

Examples:

```bash
curl http://localhost:6688/api/briefs/config

curl -X POST http://localhost:6688/api/briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"sources":["cls"],"period":"manual-test","force":true}'

curl http://localhost:6688/api/briefs/latest

curl -X DELETE 'http://localhost:6688/api/briefs/history?olderThan=1m'
```

## Hot List Sources

Hot list sources live in `src/host-lists/sources`.

New sources should:

- Be an injectable provider.
- Use the `@HotSource` decorator.
- Implement `HotListSource`.
- Return data matching `HotListGetListResponse`.
- Be registered in `src/host-lists/hot-lists.module.ts`.

Source metadata is discovered by `HotListsService` using Nest `DiscoveryService`.

## Database Conventions

Schemas live in `src/database/schemas`.

Repositories live in `src/database/repositories`.

When adding a schema or repository:

1. Add the schema with `SchemaFactory.createForClass`.
2. Register it in `src/database/database.module.ts` via `MongooseModule.forFeature`.
3. Add and export the repository from `DatabaseModule`.

Daily brief collection has a unique index on `{ briefDate: 1, period: 1 }`.

## Scheduler Notes

There are two scheduler areas:

- `src/scheduler`: hot data fetching and Mongo backup.
- `src/daily-brief/daily-brief.scheduler.ts`: AI daily brief generation.

Both use `SchedulerRegistry` and cron jobs.

Avoid adding another `ScheduleModule.forRoot()` unless necessary. If refactoring scheduler modules, ensure cron registration still works at app startup.

## Frontend Documentation

Use these docs when working on or discussing frontend integration:

- `docs/daily-brief.md`
- `docs/daily-brief-frontend.md`

Frontend should not request `includeDebug=true` in normal user flows.

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

For destructive daily brief cleanup routes, prefer safe no-op checks first:

```bash
curl -X DELETE 'http://localhost:6699/api/briefs/1900-01-01?period=manual-test'
curl -X DELETE 'http://localhost:6699/api/briefs/history?beforeDate=1900-01-01'
```

Expected result should include `deletedCount: 0`.

## Editing Guidelines

- Keep changes scoped to the requested module.
- Use the existing NestJS module/service/controller/repository pattern.
- Update docs when changing API behavior.
- Update `.env.example` when adding or changing environment variables.
- Avoid returning large debug fields to frontend-facing APIs by default.
- Preserve user changes in a dirty worktree; do not revert unrelated edits.

