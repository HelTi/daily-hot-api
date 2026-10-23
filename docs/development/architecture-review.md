# 架构评审与优化建议（2026-10）

> 评审日期：2026-10-22
> 评审基线：`main` @ `81bfdd1`
> 评审范围：`src/**` 全部业务模块、配置与验证、部署文件（Docker/pm2/CI）、`docs/`
> 评审方式：只读代码评审 + 关键结论实测复现。**本次评审未修改任何业务代码。**
> 后续维护：完成条目后请更新「实施路线图」中的状态，或在条目上标注完成日期。

## 结论摘要

项目整体骨架健康：NestJS 模块边界清晰、**模块间没有循环依赖**（全仓无 `forwardRef`）、Repository 模式统一、每日简报的外部调用都设有超时与重试上限，且已存在约束性测试（如 Mongo 4.0 兼容性测试）。

问题集中在三类：

1. **少量已确认的线上缺陷**：动态源参数被全局校验管道拒绝、B 站 WBI 签名缓存类型错乱、热榜写库非幂等且 N+1、敏感信息写入日志。
2. **「装饰性健壮性」**：抓取主链路里的重试、并发控制、缓存失效、健康检查等代码写了，但实际不生效或互相绕过。
3. **契约不一致**：配置默认值存在两份互相矛盾的事实来源；端口在 8 个文件中出现 6688 / 6689 / 3000 三套约定；文档与实现多处漂移。

规模参考：`src` 下 137 个 TypeScript 文件、约 1.28 万行；已注册 64 个热榜源。

### 健康度评分

| 维度 | 评价 | 核心问题 |
| --- | --- | --- |
| 模块划分 | **B** | 边界清楚无环；但 `HotListsModule` 注册 64 个源、`DatabaseModule` 承担连接+Schema+全部 Repository；调度器依赖全局模块隐式提供 `SchedulerRegistry` |
| 抓取 / 缓存链路 | **C** | 缓存键错位、`noCache` 先删后取、重试被错误吞噬、缓存失效 key 写错、全量并发抓取 |
| 数据层 | **C+** | Repository 分层好；但写库非幂等 + 逐条 upsert、无数据保留策略、索引膨胀 |
| 每日简报 | **B-** | 配置/客户端治理好；但 510 行 God service、生成状态机存在竞态、主题选择有偏 |
| 配置 / 部署 | **C-** | 两份默认值表、4 个文档化变量从未生效、端口三套约定、pm2/docker 与 README 矛盾 |
| 观测 / 测试 / CI | **D+** | 无 PR CI 门禁、测试基线为红、无指标与 requestId、高风险区零测试 |
| 类型安全 | **D** | `strictNullChecks`、`noImplicitAny` 关闭（实测开启成本已很低） |

### 如果只做五件事

1. 修动态源参数 400（P0-1，约半天）。
2. 修 WBI 签名缓存 + 清理日志中的密码/token（P0-2、P0-4，约半天）。
3. 热榜落库改 `bulkWrite` + 唯一索引（P0-3，1–2 天）。
4. 抽统一刷新服务 + 并发上限，让重试与缓存失效真正生效（P1-A，约 1 周）。
5. 建 PR CI 门禁 + 配置默认值收敛为单一事实来源（P1-D，2–3 天）。

---

## 一、P0：已确认缺陷（建议立即修复）

### P0-1 动态源参数全部被 400 拒绝（功能回归）

**现象**：`GET /hot-lists/{source}?{sourceParam}=...` 中，除 `noCache/limit/rss/type` 外的所有源特定参数都会返回 400，例如 `?area=global` 报 `property area should not exist`。

**证据**：

- 全局管道开启 `whitelist + forbidNonWhitelisted`：`src/main.ts:29-35`。
- `HotListQueryDto` 用 TypeScript 索引签名“声明”动态参数，但索引签名不是 class-validator 元数据：`src/host-lists/dto/hot-list.dto.ts:30-32`。
- 控制器本意是把额外参数透传给数据源：`src/host-lists/hot-lists.controller.ts:33`、`:55`。
- 实测复现（使用仓库实际 DTO 与管道配置）：`{ area: 'global' }` → `property area should not exist`。

**影响**：以下已实现且被文档宣传的参数当前不可用：

| 来源 | 参数 | 定义位置 |
| --- | --- | --- |
| nytimes | `area` | `src/host-lists/sources/nytimes.source.ts:29` |
| history | `month`、`day` | `src/host-lists/sources/history.source.ts:45-49` |
| weatheralarm | `province` | `src/host-lists/sources/weatheralarm.source.ts:30` |
| hupu | `page`、`pageSize`、`cursor` | `src/host-lists/sources/hupu.source.ts:36-38` |
| miyoushe | `game` | `src/host-lists/sources/miyoushe.source.ts:48` |

同时这是后续新增源参数的静默陷阱。

**修复建议**：把这些已知可选参数显式声明到 DTO 中（保留 `forbidNonWhitelisted`），删除误导性的索引签名注释；补充 e2e：`/hot-lists/nytimes?area=global` 应返回 200。若确实需要开放式参数，可追加一个 `@Query() raw: Record<string, string>`（原生 Object 类型会被管道跳过）后合并。

**工作量**：S（约半天，低风险）。

### P0-2 Bilibili WBI 签名缓存类型错乱

**现象**：B 站排行榜新接口在第一次请求之后失效，退化为 legacy 接口；生成的请求 URL 中出现 `&[object Object]`。

**证据**：

- `getBiliWbi()` 用 `cacheService.get<string>(CACHE_KEY)` 读取缓存，命中时直接 `return cachedData`：`src/token/token.service.ts:125-151`。
- 但 `CacheService.get()` 返回的是 `CacheData<T>` 对象（`{ data, updateTime }`）：`src/cache/cache.service.ts:45-59`；写入时也被包成 `{ data: query, updateTime }`（`src/token/token.service.ts:144-148`）。
- 因此缓存命中后返回的是对象而非字符串，被拼进 URL：`src/host-lists/sources/bilibili.source.ts:95-99`。
- 缓存使用全局单一 key（`CACHE_KEY`），不区分 `rid/type`，第一个分区的签名会被所有分区复用。
- `src/token/token.service.spec.ts:16` 将 `get` mock 为 `null`，掩盖了该缺陷。

**修复建议**：统一缓存读取契约（返回 `CacheData<T>` 或提供 `getValue()`）；缓存 WBI 的 `img_key/sub_key` 而不是成品签名，每次请求按参数重新签名；按参数排序后分 key；补一条「缓存命中」单测。

**工作量**：S（约半天，低风险）。

### P0-3 热榜落库非幂等 + N+1 写入

**现象**：同一来源的同一内容存在重复入库风险；单次抓取写入是逐条串行 upsert，抓取整体变慢。

**证据**：

- Schema 注释写“去重索引：source + url 组合唯一索引”，但 `index()` 没有 `unique: true`：`src/database/schemas/hot-item.schema.ts:47`。
- 写入路径为「先批量查重 → 再逐条 `findOneAndUpdate` upsert」，属于典型 TOCTOU；且循环内逐条 await：`src/database/repositories/hot-item.repository.ts:111-156`。
- 并发写方至少有三处：定时任务 `src/scheduler/tasks/fetch-hot-data.task.ts:73`、手动触发 `src/scheduler/scheduler.service.ts:246-263`、简报生成 `src/daily-brief/daily-brief.service.ts:319`。
- 代码中计算的 `urlCountMap` 最终未被使用（`src/database/repositories/hot-item.repository.ts:99-109`），属于残留逻辑。

**影响**：并发写可能产生永久重复数据，导致 `/api/history/stats` 失真、简报输入重复、存储与索引膨胀；60 个源 × 每源约 50 条 ≈ 3000 次串行数据库往返，是抓取耗时的主要来源之一。

**修复建议**：先清理存量重复 → 建唯一索引 `{ source: 1, url: 1 }, { unique: true }` → 写入改为一次 `bulkWrite`（`updateOne + upsert`，`ordered: false`，容忍 `E11000`）→ 删除未使用的 `urlCountMap`。索引创建需在低写入窗口或维护窗口执行。

**工作量**：M（1–2 天，中等风险：唯一索引会暴露历史脏数据，需先迁移）。

### P0-4 敏感信息写入日志

**证据**：

- `console.log('Redis client ready', client)` 直接打印 ioredis 实例：`src/cache/cache.module.ts:23-28`。实测 ioredis 实例被 `util.inspect` 时会带出 `options.password`，配置了 `REDIS_PASSWORD` 时密码会进入容器日志。
- 51cto token 流程打印完整上游响应（含 token）：`src/token/token.service.ts:186-196`。
- 全仓还有 19 处 `console.*`，与 Nest `Logger` 混用。

**修复建议**：删除 client 全量打印（只输出 host/port 或连接状态）；删除上游响应全量日志；统一使用 Nest `Logger`；接入日志脱敏约定（password/token/apiKey 字段）。

**工作量**：S（约半天，低风险）。

### P0-5（条件性）默认 Compose 把无认证的 MongoDB / Redis 暴露到 0.0.0.0

**前提**：仅当该 Compose 部署在公网可访问主机上时，本条为 P0。

**证据**：

- Redis 发布端口 `6380:6379`：`docker-compose.yml:29-30`；MongoDB 发布端口 `27017:27017`：`docker-compose.yml:47-48`。
- Redis 配置 `protected-mode no` 且未启用 `requirepass`：`redis.conf:112`；MongoDB 镜像未启用认证。
- 应用本身无鉴权（按 `AGENTS.md` 约定由反向代理/网关负责），但文档中没有网关与防火墙示例。

**影响**：公网部署时数据库可被直接读写，Redis 可被滥用，AI/Tavily 额度可被消耗，历史简报可被 `DELETE`。

**修复建议**（基础设施层，不引入应用内鉴权）：发布端口改为只绑 `127.0.0.1` 或不再发布数据库端口（应用走 Compose 网络）；Redis 启用 `requirepass` 并注入 `REDIS_PASSWORD`；MongoDB 配置 root 用户；新增 `docs/operations/gateway.md` 提供 nginx/Caddy 与防火墙示例。

**工作量**：S/M。

---

## 二、P1：结构性优化

### A. 抓取与缓存主链路（投入产出最高）

| 编号 | 问题 | 关键证据 | 建议 |
| --- | --- | --- | --- |
| A1 | 调度执行模型不成立：`isRunning` 只覆盖“启动抓取”的毫秒级窗口；64 个源全部 fire-and-forget 并发；`executeBatch`（并发 5、批间延迟）是死代码；手动 trigger 串行阻塞且无视锁 | `src/scheduler/scheduler.service.ts:211-243`、`:245-263`、`src/scheduler/tasks/fetch-hot-data.task.ts:112-173` | 抽 `FetchCoordinator`：同源 in-flight 去重 + 全局并发上限（复用 `executeBatch`）；cron 只负责选源；`POST trigger` 返回 202 + runId |
| A2 | HTTP 缓存层错位：key 只有 `http:${url}`，忽略 params/headers/POST body；`noCache` 先删缓存再请求，上游故障时把可用缓存删掉；无 single-flight，cron 全量并发必然击穿 | `src/http/http.service.ts:110-125`、`:142-147`、`:183-198` | 改为源结果级缓存 `hotlist:${source}:${stableParams}`；成功后才覆盖；同 key 合并 in-flight；保留各源自有 TTL |
| A3 | 错误吞噬使重试与监控全部失效：`HotListsService` 捕获所有异常返回空数组，因此 `fetchWithRetry` 永远不会触发；18 个源内部还会再吞一次 | `src/host-lists/hot-lists.service.ts:106-152`、`src/scheduler/tasks/fetch-hot-data.task.ts:186-206` | 拆出会抛错的 `fetchSource()` 供调度/简报使用，容错只保留在 controller；重试只针对网络/超时/5xx/429 并加指数退避+抖动；增加每域限流 |
| A4 | 缓存失效是死 key：刷新成功后清 `hotlist:${source}`，但真实写入的是 `http:${url}` | `src/scheduler/tasks/fetch-hot-data.task.ts:211-219` | 随 A2 一起修；短期先改为 `delByPattern('hotlist:')` |
| A5 | 源注册靠手工维护：`hot-lists.module.ts` 约 128 行 import + providers，每次加源改两处；重复 `@HotSource` 名称会静默覆盖；无漂移保护 | `src/host-lists/hot-lists.module.ts:6-155`、`src/host-lists/hot-lists.service.ts:30-56` | 建 `src/host-lists/sources/index.ts` barrel 导出 `HOT_LIST_SOURCES`，`providers: [HotListsService, ...HOT_LIST_SOURCES]`；加测试校验源数量、`@HotSource` 唯一性（S，建议早做） |

补充说明：

- A1 中 `executeBatch` 是“已经写好的正确设计”，直接复用即可，不需要新写并发控制。
- A2 中 `fromCache` 目前由 60/64 个源手工透传，缺失时服务端用 `!noCache` 猜测，会向 API 返回错误的缓存状态（`src/host-lists/hot-lists.service.ts:113`）；改为包装层统一计算后可以删除各源的透传代码。
- A3 的修复是后续「监控源健康度」的前提；当前无法区分“源返回空”与“源已损坏”。

### B. 每日简报

| 编号 | 问题 | 关键证据 | 建议 |
| --- | --- | --- | --- |
| B1 | 生成状态机存在竞态：check-then-upsert 的 TOCTOU；cron 永远 `force: true` 跳过检查；终态写入只按 `{briefDate, period}` 过滤、无 `generationId`，后写者覆盖先写者；旧任务的迟到 `markFailed` 会把已成功简报降级为 failed（`findLatest` 只查 success，当天简报会“消失”），且不会失效排行榜缓存；多实例部署无分布式锁 | `src/daily-brief/daily-brief.service.ts:61-95`、`src/database/repositories/daily-brief.repository.ts:450-518`、`src/daily-brief/daily-brief.scheduler.ts:111-124` | 抽 `BriefGenerationStateStore`：原子 claim（含 stale 条件）+ 持久化 `generationId` + 终态条件更新；失败不原地降级（保留上次成功快照）；加心跳/总超时；cron 与手动走同一套 claim |
| B2 | 510 行 God service + 主题选择偏差：8 种职责、7 个依赖；公开字段策略散落 3 处；prompt 无预算（desc 不截断、搜索证据全量进入）；候选按全局时间排序 → 单源可能霸榜、跨源同题重复、Tavily 重复计费 | `src/daily-brief/daily-brief.service.ts:52-145`、`:288-298`、`:377-421`、`src/database/repositories/daily-brief.repository.ts:81-84`、`:135-152`、`src/daily-brief/clients/ai-analysis.client.ts:87-112` | 按 `BriefInputBuilder / BriefTopicSelector / BriefSearchEnricher / PromptBuilder / BriefPresenter / BriefRetentionService` 增量拆分；主题选择按源配额 + 跨源标题去重 + Tavily 查询缓存；prompt 加字符预算与输出上限 |
| B3 | 简报刷新绕过调度守卫：直接 `getHotList + saveHotItems`，绕过 `source.enabled`、`IGNORE_SAVE_SOURCES`、重试、`lastFetchAt` 与缓存清理；默认两个 cron（`0 */12 * * *` 与 `0 12 * * *`）会在 12:00 同时触发 | `src/daily-brief/daily-brief.service.ts:300-342`、`src/scheduler/scheduler.service.ts:227-239`、`src/config/configuration.ts:20-25` | 抽共享的 `HotListRefreshService`（见 A1），调度与简报统一调用；简报默认 cron 错峰（如 12:10）或复用刚刷新数据 |

### C. 数据层

| 编号 | 问题 | 关键证据 | 建议 |
| --- | --- | --- | --- |
| C1 | 无数据保留策略：`hot_items` 无 TTL/归档，索引、备份无限增长；`/api/history/stats` 每次全表 `$group` + `countDocuments`；搜索把用户 `keyword` 直接当 `$regex`（未转义，输入 `(` 即 500，可构造昂贵正则），已建 text 索引从未使用；`GET /api/history/latest` 的 limit 无上限 | `src/database/repositories/hot-item.repository.ts:190-196`、`:237-263`、`src/history/history.controller.ts:40-46` | 增加可配置保留天数（TTL 或归档任务）；`/stats` 加短 TTL 缓存；搜索先转义并限制长度，或改用 `$text`；limit 加 `@Max` |
| C2 | 索引设计膨胀：`hot_items` 共 7 个索引，单字段 `source/url/timestamp` 与复合索引前缀重复，text 索引闲置，而 DTO 允许的 `title/createdAt` 排序无索引；另外文档约束 Mongo 4.0 但 Compose 使用 7.0，版本目标漂移 | `src/database/schemas/hot-item.schema.ts:47-50`、`src/history/dto/search-history.dto.ts:42-47`、`docker-compose.yml:45` | 保留唯一 `{source,url}`、`{source,timestamp:-1}`、`{timestamp:-1}`，删除重复单字段与闲置 text 索引（先用 `$indexStats` 确认线上使用）；与维护者确认目标 Mongo 版本 |
| C3 | 连接与生命周期：`lazyConnection: true` 使 `retryAttempts/retryDelay` 永远不生效；应用无 `enableShutdownHooks()`，两个 scheduler 的 `onModuleDestroy` 在生产环境从不执行；`/health` 只 ping Redis 且内部已 catch，状态永远不会变 `degraded`，Mongo 完全不在健康检查内 | `src/database/database.module.ts:16-39`、`src/main.ts:8-23`、`:25-52`、`src/app.controller.ts:19-43`、`src/cache/cache.service.ts:140-148` | 保留懒连接但增加操作级重试/超时；`/health` 拆分 liveness/readiness 并检查 Mongo `readyState`，异常返回 503；启用 shutdown hooks（先停调度→等待在途任务→关连接）；`uncaughtException` 仅对已知瞬时 Mongo 错误继续运行 |

### D. 配置 / 交付 / 工程

| 编号 | 问题 | 关键证据 | 建议 |
| --- | --- | --- | --- |
| D1 | 配置双事实来源且互相矛盾：`configuration.ts` 与 `validation.schema.ts` 两张默认值表（如 `BRIEF_SOURCES` 3 个 vs 7 个、`ALLOWED_HOST` `localhost` vs `ttkit.cn`）；boolean 默认值写在 `z.preprocess` 内不可达；`ALLOWED_HOST`、`DISALLOW_ROBOT`、`USE_LOG_FILE`、Compose 的 `REDIS_URI` 文档化了但代码从未读取；`REQUEST_TIMEOUT` 未使用（HTTP 硬编码 10s）；schema 非 strict，env 拼写错误（如 `MONGO_URI` 与 `MONGODB_URI`）被静默忽略 | `src/config/configuration.ts:3-48`、`src/config/validation.schema.ts:3-57`、`src/config/config.module.ts:8-21`、`src/http/http.service.ts:106` | 收敛为单一事实来源（zod 解析一次，删除重复表或自动派生）；布尔解析拒绝非法值；schema 加 `.strict()` 或记录未知键；实现或删除 4 个无效变量；要求 `MONGODB_URI` 等关键项非空 |
| D2 | 部署端口契约矛盾：实际默认端口为 6689（校验后的默认值会写回 `process.env`），但 `.env.example` 写 6688、`healthcheck.js` 默认 3000、`ecosystem.config.cjs` 硬编码 6688、README 的 `docker run -p 6688:6688` 实际不可达；pm2 用 `nest start` 运行生产 | `src/config/validation.schema.ts:4`、`src/main.ts:50`、`.env.example:1`、`healthcheck.js:5`、`ecosystem.config.cjs:12`、`package.json:14` | 统一默认端口并在 `main.ts` 通过 `ConfigService` 读取；healthcheck 使用同一端口；pm2 改 `node dist/main` 且不覆盖 `.env` 的 PORT；同步 README/docs，并加容器冒烟测试 |
| D3 | 工程门禁缺失：`.github/workflows` 只有文档部署与 Docker 推送，没有 PR 的 lint/test/typecheck；测试基线为红（`src/app.controller.spec.ts` 因 Provider 依赖缺失失败，e2e 陈旧且有 tsc 错误）；lint 脚本带 `--fix`；`host-lists/http/scheduler/history` 四个高风险区域零测试 | `.github/workflows/*.yml`、`src/app.controller.spec.ts`、`test/app.e2e-spec.ts`、`package.json:19` | 新增 `ci.yml`（`tsc --noEmit` → `eslint`（无 `--fix`）→ `jest`）；修复两个陈旧 spec 或删除失效 e2e；为核心三类补测试（源注册、HTTP 缓存/超时、调度并发、简报状态机） |
| D4 | 类型安全债：`strictNullChecks`、`noImplicitAny`、`strictBindCallApply`、`useUnknownInCatchVariables` 全部关闭 | `tsconfig.json:16-21` | 实测开启 `strictNullChecks` 仅 31 个错误 / 31 个文件（16 个集中在 `configuration.ts`），可立即作为独立 PR 落地；随后再开 `noImplicitAny` |
| D5 | 调度配置与备份失真：`SourceConfig.interval/lastFetchAt` 只写不读，但文档承诺可按源配置；`reconfigure` 会把运行期 `enabled` 重置回启动值；`mongodump` 备份先 `rm -rf data` 再 dump、非原子，生产镜像（node:22-alpine）没有 mongodump 且 Compose 未挂载数据卷，备份实际不存在还会删掉上一份 | `src/database/schemas/source-config.schema.ts:16-20`、`src/database/repositories/source-config.repository.ts:95-100`、`src/scheduler/scheduler.service.ts:162-185`、`:280-297`、`Dockerfile:2`、`:15-40`、`docker-compose.yml:1-24` | 实现按 `lastFetchAt + interval` 选取到期源，或从 Schema/API/文档中正式移除 `interval`；`reconfigure` 保留运行期 enabled；备份改为临时目录 → 校验 → 原子替换 + 轮转，使用 `execFile` 传参，并安装 mongo-tools/挂载备份卷（或删除内置任务改为文档化的外部备份） |

---

## 三、P2：长期技术债

### 热榜源代码复用

64 个源约 5.9k 行，其中约 20–25% 是重复样板：60/64 重复 `{ fromCache, updateTime }` 信封、21 处硬编码 User-Agent（`user-agents` 依赖已安装但未使用）、61 处重复构造器注入。

建议：新增 `AbstractHotListSource`（模板方法：fetch → normalize → buildResponse），提供 header profile 与时间解析 helper；**只迁移简单单请求源与新源**，HTML 解析/多级 fallback 源保持现状。**不要**做声明式 selector DSL 全量重写（风险高、收益低）。

顺带可修的小缺陷：

- `hostloc` 把请求头写成 `userAgent`（应为 `User-Agent`）：`src/host-lists/sources/hostloc.source.ts:37-40`。
- 3 个源缺少 `fromCache` 字段：github / history / hupu。
- 5 个源把 `updateTime: 0`（number）写进 string 字段，RSS 会输出 1970 年：如 `src/host-lists/sources/douban-group.source.ts:82`、`src/host-lists/sources/kuaishou.source.ts:61`。

### 模块与分层边界

- `HotListsModule` 是 God module（5 个基础设施 import + 65 个 provider）；`DatabaseModule` 同时承担连接引导、Schema 注册与全部 Repository 导出。
- 控制器直连 Repository 并返回裸 lean 文档：`src/scheduler/scheduler.controller.ts:65-68`。
- Repository 反向依赖 host-lists 的领域类型：`src/database/repositories/hot-item.repository.ts:5`；RSS 反向依赖 `RouterData`：`src/rss/rss.service.ts:3`。
- 两套 axios 实例（6s / 8s）：`src/http/http.module.ts:6-16` 与 `src/host-lists/hot-lists.module.ts:79-80`。
- `ScheduleModule.forRoot()` 在 `SchedulerModule`，`DailyBriefModule` 只是裸 import 却依赖其全局 `SchedulerRegistry`——当前能跑，但简报模块无法独立启动，也让「forRoot 只应一次」的约束实际失效。

建议：新增共享 `InfrastructureModule`（cache/http/scheduling 的统一入口）；把请求级读取收敛到 service；Repository 输入类型内聚到 database 层；源结果统一经 Presenter/DTO 映射后再返回。

### 可观测性

- 访问日志只有 ip + path，没有状态码、耗时、requestId，且包含 `/health`：`src/common/middlewares/logger.middleware.ts:10-14`。
- 19 处 `console.*`；`USE_LOG_FILE` 未实现；无 metrics。
- 建议：requestId + 访问日志拦截器（排除 /health）；用 prom-client 暴露抓取成功率、源失败数、简要生成耗时/失败数、缓存命中率；日志字段脱敏。

### 文档与数据细节

- `AGENTS.md` 指向的 `docs/daily-brief.md`、`docs/daily-brief-frontend.md` 已不存在（实际为 `docs/guide/daily-brief.md`、`docs/development/daily-brief-frontend.md`）。
- `docs/reference/environment-variables.md` 缺少 6 个已实现变量（`AI_TIMEOUT_MS`、`AI_MAX_RETRIES`、`TAVILY_TIMEOUT_MS`、`BRIEF_GENERATING_TIMEOUT_MINUTES`、`BRIEF_SOURCE_CONCURRENCY`、`BRIEF_SEARCH_CONCURRENCY`）。
- `docs/.vitepress/dist` 与 `cache` 已被 gitignore，无需处理；但本地存在历史构建产物，阅读时注意不要误当源码。
- Mongoose 7 会剥离 `$set` 中的 `undefined`，导致成功简报残留上次错误信息：`src/database/repositories/daily-brief.repository.ts:461-466`、`:492-496`；应改用 `$unset: { error: 1 }`。
- `inputWindow` 未声明 `_id: false`，每次 upsert 重新生成子文档 `_id` 并泄漏到公开 API：`src/database/schemas/daily-brief.schema.ts:27-38`。
- `token`/`rss` 模块职责混杂（51cto token 混在 TokenService、RSS 出错时返回 JSON 但已设置 XML Content-Type）：`src/token/token.service.ts:180-196`、`src/rss/rss.service.ts:44-47`。

---

## 四、实施路线图

| 阶段 | 内容 | 预估 | 状态 |
| --- | --- | --- | --- |
| **Phase 0 止血** | P0-1、P0-2、P0-4；D2 端口与 healthcheck；D3 CI 门禁 + 修复红测试；A5 源注册 barrel | 2–3 天 | 待办 |
| **Phase 1 主链路** | P0-3 写库幂等 + `bulkWrite`；A1/A2/A3 统一刷新服务 + 缓存语义 + 错误分层；D1 配置单一来源；C3 shutdown hooks + readiness | 1–2 周 | 待办 |
| **Phase 2 业务质量** | B1 生成状态机；B2 简报拆分 + 主题选择；C1 保留策略 + history 查询；C2 索引；D4 `strictNullChecks` | 2–4 周 | 待办 |
| **Phase 3 持续** | P0-5 部署安全；D5 备份方案；源基类迁移；可观测性指标；文档生成校验 | 持续 | 待办 |

建议每项独立小 PR 落地，并附带对应的验证命令与文档更新；P0-3 的唯一索引迁移需要单独的回滚方案（保留旧集合或先做备份）。

---

## 五、值得保留的设计

- NestJS 模块化边界与 Repository 分层，模块间无循环依赖。
- `DailyBriefConfigService` 通过 typed getter 集中读取配置，避免调用点重复默认值（`src/daily-brief/daily-brief.config.ts`）。
- 每日简报的外部调用都有明确超时/重试上限，AI 输出有 zod 兜底与结构校验。
- 约束性测试：Mongo 4.0 聚合兼容性测试（`src/database/repositories/mongo40-compatibility.spec.ts`）。
- 缓存清理已从 `KEYS` 改为 `SCAN` 分批删除（`src/cache/cache.service.ts:104-135`）。
- Docker 以非 root 用户运行、`.dockerignore` 排除 `.env` 与测试文件。

## 六、明确不建议做的事

1. **不要**为 64 个源引入声明式 DSL 或运行时 glob 自动注册：收益低于风险，barrel + 测试足够；运行时动态 require 会破坏 `dist`/`ts-jest` 与环境可移植性。
2. **不要**给应用内置鉴权：`AGENTS.md` 已约定由反向代理/网关负责，改应用层鉴权需先与维护者确认（P0-5 在基础设施层解决）。
3. **不要**在没有确认目标 MongoDB 版本前继续扩大「Mongo 4.0 兼容」约束（当前 Compose 已运行 7.0）。

---

## 附录 A：本次评审的验证命令与结果

以下命令均为只读，可在本地复现：

```bash
# 1. 测试基线（当前为红）
npx jest --silent
# 结果：Test Suites: 1 failed, 9 passed；Tests: 1 failed, 83 passed
# 失败项：src/app.controller.spec.ts › root › should return "Hello World!"
# 原因：AppService/AppController 依赖的 HotListsService/CacheService 未在测试模块中提供，且首页已改为 hbs 渲染

# 2. 源码 lint
npx eslint "src/**/*.ts"
# 结果：0 error / 0 warning（test/app.e2e-spec.ts 另有 1 个历史遗留错误）

# 3. 类型检查
npx tsc --noEmit --incremental false
# 结果：src 可编译；仅 test/app.e2e-spec.ts 报 TS2349

# 4. 开启 strictNullChecks 的成本评估
npx tsc --noEmit --incremental false --strictNullChecks
# 结果：31 errors / 31 files，其中 16 个集中在 src/config/configuration.ts

# 5. 动态参数 400 复现
# 使用仓库实际 DTO + class-validator 的 whitelist/forbidNonWhitelisted 配置校验 { area: 'global' }
# 结果：property area should not exist

# 6. ioredis 密码泄漏复现
# node -e "打印 new Redis({password}) 实例的 util.inspect"
# 结果：输出包含 options.password 明文
```

## 附录 B：未验证 / 需要线上确认的事项

- 线上 `hot_items` 是否已存在重复数据、各索引的实际使用率（建议 `db.hot_items.getIndexes()`、`$indexStats`、`explain()`）。
- B 站上游对 `[object Object]` 签名的具体拒绝行为（当前仅确认 URL 已错误）。
- 生产环境实际使用的 MongoDB 版本（Compose 为 7.0，文档要求 4.0 兼容）。
- 生产环境 `mongodump` 是否可用（Docker 镜像内确认不可用；裸机/pm2 取决于宿主机）。
- 生产环境 `Dockerfile` 构建与 healthcheck 的实际表现（本地未执行构建）。
- 数据增长速率由 `.env` 中的 cron 频率与启用源数量决定，评审时未统计线上真实值。

## 附录 C：相关文档

- 系统架构：[系统架构](/development/architecture)
- 数据库与缓存：[数据库与缓存](/development/database-and-cache)
- 调度器实现：[调度器实现](/development/scheduler)
- 添加热榜源：[添加热榜源](/development/add-hot-source)
