# 通用新闻简报功能说明

通用新闻简报用于把指定板块的热榜内容整理成统一结构的新闻条目。与面向财经分析的 [AI 每日简报](/guide/daily-brief) 并列存在，两者使用不同的接口、集合和调度器，互不影响。

新闻简报的核心是每个板块返回同一种结构：**新闻标题（`title`）/ 新闻简介（`summary`）/ 新闻内容（`content`）/ 新闻来源（`source`）**。前端只需要一个新闻列表组件，板块差异只体现在 `category`、`categoryName` 和 `tags` 上。

::: info 当前实现范围（P1）
已实现：生成链路、只读查询（`config`、`categories`、`digest`、`latest`、`:date`、分页列表）、删除清理接口，以及默认关闭的搜索增强。生成由定时任务负责，手动生成接口默认禁用；前端只允许调用只读 `GET` 接口。财经板块不做股票关联或产业链映射。
:::

## 功能概览

内置四个板块，板块定义在代码内注册表（`src/news-brief/categories/news-category.registry.ts`），`NEWS_BRIEF_CATEGORIES` 只决定启用哪些板块及其顺序：

| code | 名称 | 默认数据源 | 目标条数 |
| --- | --- | --- | --- |
| `finance` | 财经 | `cls`、`yicai`、`wallstreet`、`jin10`、`tonghuashun`、`eastmoney`、`gelonghui`、`caixin` | 8 |
| `general` | 综合新闻 | `thepaper`、`qq-news`、`netease-news`、`sina-news`、`toutiao`、`baidu`、`weibo`、`zhihu` | 8 |
| `tech` | 科技 | `36kr`、`ithome`、`huxiu`、`geekpark`、`ifanr`、`sspai`、`juejin`、`xinyu` | 8 |
| `sports` | 体育 | `hupu`、`weibo`、`baidu`、`zhihu`、`toutiao`、`tieba`、`bilibili`、`sina-news` | 8 |

生成链路：

```text
定时任务触发（或运维手动触发）
  -> 读取 NEWS_BRIEF_CATEGORIES 与各板块 profile
  -> 抓取板块数据源的热榜并写入历史库（同一次运行里共用的来源只抓一次）
  -> 读取回看窗口内的历史热点（每源只取前 NEWS_BRIEF_TOP_ITEMS_PER_SOURCE 条）
  -> 按来源去重、交错排序，截断到 NEWS_BRIEF_MAX_CANDIDATES
  -> （可选）搜索增强对该板块生效时为前 N 条候选补充检索证据
  -> 调用 OpenAI 兼容接口生成结构化 JSON
  -> 校验并回填来源、发布时间，归一化成统一条目
  -> 保存到 MongoDB
  -> API 返回前端可用的简报内容
```

与 AI 每日简报的区别：

| 维度 | AI 每日简报 | 通用新闻简报 |
| --- | --- | --- |
| 接口前缀 | `/api/briefs` | `/api/news-briefs` |
| 定位 | 财经产业分析 + A 股关联 | 多板块新闻摘要，结构统一 |
| 输出主体 | `analysis.topics[]`（产业链 / 股票映射） | `items[]`（标题 / 简介 / 内容 / 来源） |
| 数据集合 | `dailybriefs` | `newsbriefs` |
| 调度器 | `BRIEF_*` | `NEWS_BRIEF_*` |
| 搜索增强 | 默认开启 | 默认关闭，可按需开启（P1 已支持） |
| 列表与聚合 | 分页列表 | 分页列表 + `digest` 多板块聚合 |
| 删除清理 | 支持 | 支持（无鉴权，需网关限制） |
| 手动生成 | 可直接调用 | **默认禁用**，仅运维临时开启 |

财经板块只做新闻摘要，**不做**股票关联或产业链映射；需要 A 股分析时继续使用 AI 每日简报。

## 环境变量

```bash
# 通用新闻简报配置
NEWS_BRIEF_ENABLED=false
NEWS_BRIEF_CRON_EXPRESSION=30 8 * * *
NEWS_BRIEF_TIMEZONE=Asia/Shanghai
NEWS_BRIEF_CATEGORIES=finance,general,tech,sports
NEWS_BRIEF_LOOKBACK_HOURS=24
NEWS_BRIEF_TOP_ITEMS_PER_SOURCE=8
NEWS_BRIEF_MAX_CANDIDATES=40
NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY=8
NEWS_BRIEF_SOURCE_CONCURRENCY=3
NEWS_BRIEF_CATEGORY_CONCURRENCY=1
NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES=30
NEWS_BRIEF_MANUAL_GENERATE_ENABLED=false

# P1 搜索增强（默认关闭；开启后会产生搜索费用）
NEWS_BRIEF_SEARCH_ENABLED=false
NEWS_BRIEF_SEARCH_MAX_QUERIES=6
NEWS_BRIEF_SEARCH_CONCURRENCY=3
NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS=2000
NEWS_BRIEF_SEARCH_PROVIDERS=tavily,deepseek

# 复用 AI 配置（与每日简报共用，不新增密钥变量）
OPENAI_API_KEY=skxxx
OPENAI_API_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
AI_TIMEOUT_MS=120000
AI_MAX_RETRIES=2
```

字段说明：

| 配置 | 说明 |
| --- | --- |
| `NEWS_BRIEF_ENABLED` | 是否在服务启动时注册新闻简报定时任务，默认 `false` |
| `NEWS_BRIEF_CRON_EXPRESSION` | 生成 cron 表达式，默认每天 08:30 |
| `NEWS_BRIEF_TIMEZONE` | 简报日期和定时任务使用的时区 |
| `NEWS_BRIEF_CATEGORIES` | 启用的板块 code，逗号分隔、保序；未知 code 在启动配置校验阶段就会失败 |
| `NEWS_BRIEF_LOOKBACK_HOURS` | 读取历史热点的回看窗口，默认 `24` 小时 |
| `NEWS_BRIEF_TOP_ITEMS_PER_SOURCE` | 每个来源最多纳入的候选条数，默认 `8`，取值 1–20 |
| `NEWS_BRIEF_MAX_CANDIDATES` | 送入模型的候选条目上限，默认 `40`，取值 10–40 |
| `NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY` | 每份简报的输出条数上限，默认 `8`，取值 3–10；实际生效值还会被板块 profile 的 `maxItems`（当前各板块均为 8）和提示词预算钳制，配成 9–10 不会立即生效 |
| `NEWS_BRIEF_SOURCE_CONCURRENCY` | 板块内抓取热榜源的最大并发数，默认 `3` |
| `NEWS_BRIEF_CATEGORY_CONCURRENCY` | 板块之间的生成并发数，默认 `1`（串行），取值 1–4 |
| `NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES` | 生成卡在 `generating` 多久后视为过期并允许重新生成，默认 `30` 分钟 |
| `NEWS_BRIEF_MANUAL_GENERATE_ENABLED` | 是否允许调用手动生成接口，默认 `false`（返回 403） |
| `NEWS_BRIEF_SEARCH_ENABLED` | 搜索增强总开关，默认 `false`；关闭时不发起任何搜索 |
| `NEWS_BRIEF_SEARCH_MAX_QUERIES` | 每份简报最多为多少条候选补充搜索证据，默认 `6`，取值 1–8 |
| `NEWS_BRIEF_SEARCH_CONCURRENCY` | 同时进行的搜索数量，默认 `3` |
| `NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS` | 单条搜索词最大字符数，默认 `2000`，取值 100–2000 |
| `NEWS_BRIEF_SEARCH_PROVIDERS` | 搜索平台优先级，默认 `tavily,deepseek`；留空或平台都未配置密钥时跳过搜索 |
| `OPENAI_API_KEY` / `OPENAI_API_BASE_URL` / `AI_MODEL` / `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | 与每日简报共用的模型配置 |
| `TAVILY_API_KEY` / `DEEPSEEK_SEARCH_API_KEY` 等 | 搜索平台密钥，与每日简报共用 |

`NEWS_BRIEF_MAX_CANDIDATES` 和 `NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY` 的校验上限与提示词预算（`PROMPT_BUDGET`）对齐，配成更大的值会在启动时报配置错误，而不是跑完一次简报才发现内容被静默截断。

### 数据源启用状态

生成前会像每日简报一样刷新板块数据源（走 `FetchHotDataTask`）。`source_configs` 中显式禁用的来源会被跳过，只记一条告警日志，不阻断其他来源。来源没有记录时视为启用，只有存在记录且 `enabled:false` 才会跳过。被禁用的来源只贡献回看窗口内的历史条目，日志形如：

```text
WARN [NewsBriefService] [NewsBrief] source cls contributed no fresh items: Source 'cls' is disabled
```

核对来源状态：

```bash
curl http://localhost:6689/api/scheduler/configs
```

### 搜索增强（默认关闭）

`NEWS_BRIEF_SEARCH_ENABLED=true` 时，生成过程会为部分候选新闻补充搜索证据，再交给模型生成摘要。默认关闭，因为它会产生额外的搜索费用。

行为：

- 只为前 `NEWS_BRIEF_SEARCH_MAX_QUERIES` 条候选（去重后）补充证据，同时进行的搜索数由 `NEWS_BRIEF_SEARCH_CONCURRENCY` 控制。
- 搜索词由候选的标题和描述拼接而成，并按 `NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS` 截断（最多 2000 字）。注意：DeepSeek Search 接口自身只接受 128 个 Unicode 字符，超长 query 在 DeepSeek 平台内部会被截断；2000 字上限主要对 Tavily 完整生效。
- 平台按 `NEWS_BRIEF_SEARCH_PROVIDERS` 的顺序依次尝试，每个查询拿到第一个有结果的平台即停止；单个查询失败或没有结果时降级为空证据，不阻断简报生成。
- 有结果的查询按「平台列表 + 查询词」缓存 1 小时，避免重复搜索。
- 搜索平台密钥复用 `TAVILY_API_KEY`、`DEEPSEEK_SEARCH_API_KEY` 等现有变量，不新增密钥配置。
- 搜索是否对某个板块生效要同时满足三个条件：`NEWS_BRIEF_SEARCH_ENABLED=true`、该板块 profile 的 `search` 为 `true`（`src/news-brief/categories/news-category.registry.ts`，当前四个板块都是 `true`）、至少一个平台配置了密钥。任一条不满足就跳过搜索：板块自己关掉时记一条普通日志，平台都没配密钥时记一条告警。
- 开启后模型的 `content` 目标长度从 80–300 字放宽到 80–600 字，服务端按 600 字截断。只有搜索真正对该板块生效时才放宽；板块关闭搜索或平台都没配密钥时仍按 300 字，避免模型在只有标题和摘要的输入上硬凑长文。
- 简报响应中的 `searchProvidersUsed` 返回实际命中证据的平台（如 `["tavily"]`）；为空数组表示本次没有搜索证据。
- 搜索证据保存在 `searchEvidence` 调试字段中，默认不返回，排查时用 `includeDebug=true` 查看。

## 数据结构

简报保存在 MongoDB 的 `newsbriefs` collection 中，组合键为 `briefDate + period + category`。核心字段：

```ts
{
  briefDate: string;          // YYYY-MM-DD
  period: string;             // 默认 daily
  category: string;           // finance | general | tech | sports
  categoryName: string;       // 板块展示名快照
  status: 'generating' | 'success' | 'failed';
  title?: string;
  summary?: string;
  highlights: string[];
  items: NewsBriefItem[];
  sources: string[];
  inputWindow: {
    start: Date;
    end: Date;
    lookbackHours: number;
  };
  rawInputItems: Record<string, unknown>[];   // 调试字段，默认隐藏
  searchEvidence: Record<string, unknown>[];  // 搜索证据调试字段，默认隐藏；未开启搜索增强时为空
  model?: string;
  searchProvidersUsed: string[];
  error?: string;
  generationId?: string;
  generationHeartbeatAt?: Date;
}
```

每条新闻条目（`NewsBriefItem`）结构统一：

```ts
{
  id: string;             // 稳定 hash，前端列表 key
  title: string;          // 新闻标题，最多 80 字
  summary: string;        // 新闻简介，最多 160 字
  content: string;        // 新闻内容，默认最多 300 字；开启搜索增强后最多 600 字
  source: {
    code: string;         // 热榜来源 code，如 cls / 36kr
    name: string;         // 来源展示名，如「财联社」
    url: string;          // 原文链接，由服务端从候选条目回填
  };
  publishedAt?: string;   // ISO 8601；候选条目没有时间戳时不返回该字段
  tags?: string[];        // 最多 5 个，单个 ≤12 字
  importance?: number;    // 0–100
}
```

说明：

- `briefDate + period + category` 有唯一索引，用于避免同一天同一板块重复写入。
- `source.url` 由服务端从热榜候选条目回填，模型只返回候选 `ref`，不会接触真实链接，避免编造来源地址。
- 默认响应隐藏 `rawInputItems`、`searchEvidence`、`generationId`、`generationHeartbeatAt`；调试时可以使用 `includeDebug=true` 返回前两个字段。
- `status` 为 `generating` / `failed` 时，`highlights` 和 `items` 仍是数组（可能为空），前端不需要额外判空。
- 字段使用 camelCase；时间为 ISO 字符串，日期为 `YYYY-MM-DD`；可选字段缺省时不返回。
- 内容基于热榜条目的标题和摘要整理，不抓取网页正文；信息不足时模型会标注「细节待核实」，不应把 `content` 当作完整报道。

## API 接口

基础地址示例：

```text
http://localhost:6689
```

::: warning 写接口没有内建鉴权
服务本身不对任何接口做鉴权。新闻简报的写操作必须在反向代理 / 网关层限制来源：

| 接口 | 风险 |
| --- | --- |
| `POST /api/news-briefs/generate` | 触发抓取、AI 调用，可能产生费用；**默认禁用**，仅运维临时开启 |
| `POST /api/news-briefs/scheduler/start`<br>`POST /api/news-briefs/scheduler/stop`<br>`POST /api/news-briefs/scheduler/reconfigure` | 改变定时任务运行状态；`start` 会注册 cron 并在下一个调度点真正生成，敏感度与 `generate` 相同 |
| `DELETE /api/news-briefs/:date`<br>`DELETE /api/news-briefs/history` | **不可恢复**地删除 MongoDB 中的简报记录；务必先做安全 no-op 检查，并在网关层限制来源 |

**前端只允许调用只读 `GET` 接口。** 生成由定时任务负责，不要在前端流程中触发生成接口。
:::

### 获取简报配置

```bash
curl http://localhost:6689/api/news-briefs/config
```

响应示例：

```json
{
  "enabled": false,
  "cronExpression": "30 8 * * *",
  "timezone": "Asia/Shanghai",
  "categories": [
    {
      "code": "finance",
      "name": "财经",
      "description": "货币政策、市场与公司事件、产业经济、宏观数据",
      "sources": ["cls", "yicai", "wallstreet", "jin10", "tonghuashun", "eastmoney", "gelonghui", "caixin"],
      "maxItems": 8
    }
  ],
  "lookbackHours": 24,
  "topItemsPerSource": 8,
  "maxCandidates": 40,
  "maxItemsPerCategory": 8,
  "categoryConcurrency": 1,
  "sourceConcurrency": 3,
  "generatingTimeoutMinutes": 30,
  "manualGenerateEnabled": false,
  "model": "deepseek-v4-flash",
  "searchEnabled": false,
  "searchProviders": ["tavily", "deepseek"],
  "searchMaxQueries": 6,
  "searchQueryMaxChars": 2000
}
```

`enabled` 取调度器实时状态，会随 `scheduler/start`、`scheduler/stop` 变化；`NEWS_BRIEF_ENABLED` 只是启动默认值。示例只列出一个板块，实际返回全部启用板块。配置中不返回任何密钥；`searchProviders` 是配置的平台优先级（`NEWS_BRIEF_SEARCH_PROVIDERS` 解析结果）。`searchEnabled` 为 `false` 时它只是配置值，不表示已实际调用搜索。

### 获取板块目录

```bash
curl http://localhost:6689/api/news-briefs/categories
```

返回启用板块的数组（`code`、`name`、`description`、`sources`、`maxItems`），供前端首屏筛选项使用。

### 多板块聚合（digest）

首页推荐用 `digest` 一次拿到多个板块同一天的最新简报，避免按板块并发请求：

```bash
curl 'http://localhost:6689/api/news-briefs/digest?categories=finance,tech&date=2026-11-08&period=daily'
```

响应示例：

```json
{
  "briefDate": "2026-11-08",
  "categories": [
    {
      "category": "finance",
      "categoryName": "财经",
      "status": "success",
      "brief": { "briefDate": "2026-11-08", "category": "finance", "status": "success", "items": [] }
    },
    {
      "category": "tech",
      "categoryName": "科技",
      "status": "missing",
      "brief": null
    }
  ]
}
```

- `categories` 省略时返回全部启用板块；未知板块或未启用板块返回 400，重复 code 会去重并保持请求顺序。
- `date` 缺省为今天（按 `NEWS_BRIEF_TIMEZONE` 计算），`period` 缺省为 `daily`。
- `categories[].status` 是**读取层状态**：`success` / `generating` / `failed` 来自数据库，`missing` 表示该日期该板块没有记录（数据库状态仍然只有前三种）。
- `status=missing` 时 `brief` 为 `null`；其他状态返回该板块简报的公开字段。
- 板块使用并行 `findOne` 读取（N 次查询）：数据库连接级异常会让整个 digest 请求失败，不做单板块降级。重复 query 参数（如 `?categories=finance&categories=tech`）与逗号分隔等价。

### 获取最新简报

```bash
curl 'http://localhost:6689/api/news-briefs/latest?category=tech'
```

- `category` **必填**；省略或传入未注册的板块会返回 400。板块是否在 `NEWS_BRIEF_CATEGORIES` 中启用不影响历史数据读取。
- 只返回 `status=success` 的最近一份简报；不存在时返回 200 空响应体。
- `period` 缺省为 `daily`，避免 `manual-test` 等测试数据成为「最新」：

```bash
curl 'http://localhost:6689/api/news-briefs/latest?category=tech&period=daily'
```

查看调试字段：

```bash
curl 'http://localhost:6689/api/news-briefs/latest?category=tech&includeDebug=true'
```

### 获取指定日期简报

```bash
curl 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech'
```

- `category` 必填；`period` 默认 `daily`。
- `date` 必须是 `YYYY-MM-DD`，否则返回 400。
- 返回该日期该板块的记录，可能是 `generating` 或 `failed`（`error` 字段可见）；没有记录时返回 200 空响应体。

```bash
curl 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech&period=manual-test&includeDebug=true'
```

### 分页查询简报列表

```bash
curl 'http://localhost:6689/api/news-briefs?page=1&limit=20&category=tech&period=daily'
```

参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | number | `1` | 页码，最小 1 |
| `limit` | number | `20` | 每页条数，1–100 |
| `category` | string | 全部 | 可选，已注册板块 code；未知板块返回 400 |
| `status` | string | 全部 | `generating` / `success` / `failed` |
| `period` | string | `daily` | 简报类型；空串按缺省 `daily` 处理 |

响应示例：

```json
{
  "data": [
    {
      "briefDate": "2026-11-08",
      "period": "daily",
      "category": "tech",
      "categoryName": "科技",
      "status": "success",
      "title": "科技每日简报",
      "summary": "今日科技板块……",
      "itemCount": 8,
      "updatedAt": "2026-11-08T00:41:00.000Z"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

- 列表只返回摘要字段，不返回 `items`、`highlights` 和调试字段；需要条目内容时用 `:date` 查询单份简报。
- `title`、`summary`、`updatedAt` 缺省时不返回。
- 按 `briefDate` 倒序排列。

### 手动生成简报（仅运维）

`POST /api/news-briefs/generate` 默认被禁用：`NEWS_BRIEF_MANUAL_GENERATE_ENABLED=false` 时接口返回 `403 Forbidden`。需要临时补生成时，由运维把该变量设为 `true` 并重启服务，用完改回 `false`。不要在前端或公开网关暴露该接口。

```bash
# 生成全部启用板块
curl -X POST http://localhost:6689/api/news-briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"force":true}'

# 只生成科技板块
curl -X POST http://localhost:6689/api/news-briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"category":"tech","force":true}'
```

请求参数：

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `category` | string | 否 | 全部启用板块 | 指定板块 code，未知或未启用返回 400 |
| `date` | string | 否 | 今天（按简报时区） | `YYYY-MM-DD` |
| `period` | string | 否 | `daily` | 用于测试隔离，如 `manual-test` |
| `sources` | string[] | 否 | 板块 profile 内的源 | 仅当 `category` 明确时允许，且必须是已注册来源 |
| `force` | boolean | 否 | `false` | 已成功时是否强制重新生成 |

响应固定为 `results[]`，每个板块一条结果。`POST` 走 Nest 默认状态码 **201**；请求参数非法返回 400，手动生成接口被禁用时返回 403：

```json
{
  "briefDate": "2026-11-08",
  "period": "daily",
  "results": [
    {
      "category": "finance",
      "categoryName": "财经",
      "status": "success",
      "brief": { "briefDate": "2026-11-08", "period": "daily", "category": "finance", "status": "success", "items": [] }
    },
    { "category": "general", "categoryName": "综合新闻", "status": "skipped", "reason": "already_generated" },
    { "category": "tech", "categoryName": "科技", "status": "skipped", "reason": "generation_in_progress" },
    { "category": "sports", "categoryName": "体育", "status": "failed", "error": "No hot items available for news brief" }
  ]
}
```

- `results[].status`：`success` / `failed` / `skipped`。
- `skipped.reason`：`already_generated`（当天已成功且未 `force`）/ `generation_in_progress`（同板块已有生成任务）。
- force 重新生成失败且此前已有成功记录时，旧内容会保留，该结果项带 `previousBriefRetained: true` 和旧 `brief`：

```json
{
  "category": "tech",
  "categoryName": "科技",
  "status": "failed",
  "error": "AI returned no valid news items",
  "previousBriefRetained": true,
  "brief": { "briefDate": "2026-11-08", "category": "tech", "status": "success", "items": [] }
}
```

::: tip 长请求提醒
生成全部板块默认串行执行，单板块 AI 超时为 `AI_TIMEOUT_MS`（默认 120 秒），4 个板块最坏可能超过 8 分钟。`POST /generate` 是同步长请求：当前版本没有异步任务队列和任务查询接口，运维手动调用时建议按板块分别触发，并把反向代理超时调大到覆盖单板块耗时。
:::

### 新闻简报调度状态

```bash
curl http://localhost:6689/api/news-briefs/scheduler/status
```

响应示例：

```json
{
  "isRunning": false,
  "enabled": false,
  "cronExpression": "30 8 * * *",
  "timezone": "Asia/Shanghai",
  "categories": ["finance", "general", "tech", "sports"],
  "cronJobExists": false
}
```

### 启停新闻简报调度

```bash
curl -X POST http://localhost:6689/api/news-briefs/scheduler/start
curl -X POST http://localhost:6689/api/news-briefs/scheduler/stop
curl -X POST http://localhost:6689/api/news-briefs/scheduler/reconfigure
```

语义与每日简报一致：启停只改变当前进程的内存状态，重启后回到 `NEWS_BRIEF_ENABLED`；`reconfigure` 只重新注册 cron，不会重新读取 `.env`。

### 删除指定日期简报

::: danger 破坏性操作
删除不可恢复，接口没有内建鉴权。执行前先用 `1900-01-01` 做安全 no-op 检查，确认日期、板块和 period，并确保网关层限制来源。
:::

`category` **必填**，避免一次误删全部板块；`period` 可省略，省略时删除该日期该板块的所有 period：

```bash
# 安全 no-op 检查：期望 deletedCount: 0
curl -X DELETE 'http://localhost:6689/api/news-briefs/1900-01-01?category=tech&period=manual-test'

# 删除 2026-11-08 科技板块的 daily 简报
curl -X DELETE 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech&period=daily'
```

响应示例：

```json
{
  "mode": "date",
  "briefDate": "2026-11-08",
  "category": "tech",
  "period": "daily",
  "deletedCount": 1
}
```

### 批量清理历史简报

`olderThan` 与 `beforeDate` 二选一，同时传入返回 400；`category` 可选，缺省清理全部板块：

```bash
# 安全 no-op 检查：期望 deletedCount: 0
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?beforeDate=1900-01-01'

# 删除 1 年前的简报
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?olderThan=1y'

# 只清理科技板块 30 天前的简报
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?olderThan=30d&category=tech'
```

响应示例：

```json
{
  "mode": "olderThan",
  "olderThan": "1y",
  "beforeDate": "2025-11-08",
  "category": "tech",
  "deletedCount": 12
}
```

- `olderThan` 支持 `<数字>d` / `<数字>m` / `<数字>y`（也接受 day / months / years 等写法），并支持别名 `month`、`one-month`（= `1m`）、`year`、`one-year`（= `1y`）。
- `beforeDate` 使用 `YYYY-MM-DD`，删除 `briefDate` 小于该日期的记录。
- 两个参数都不传会返回 400。

### 后续规划（P2，尚未实现）

以下增强尚未实现，不在当前版本能力范围内：

- 财经板块的股票关联扩展字段（`extensions` 目前不写入任何板块差异内容）。
- 跨板块去重：同一事件出现在多个板块时目前会分别保留。

## 前端响应字段

用于前端的响应只包含公开字段。`GET /api/news-briefs/latest?category=tech` 成功时形如：

```json
{
  "briefDate": "2026-11-08",
  "period": "daily",
  "category": "tech",
  "categoryName": "科技",
  "status": "success",
  "title": "科技每日简报",
  "summary": "今日科技板块聚焦 AI 芯片供给、国产操作系统发布与智能驾驶监管三条主线……",
  "highlights": ["要点一", "要点二", "要点三"],
  "items": [
    {
      "id": "9f2c1d7ab3e4",
      "title": "国产 GPU 厂商发布新一代推理芯片",
      "summary": "该厂商称新芯片面向大模型推理场景，已开始向云厂商送样。",
      "content": "据发布信息，新一代推理芯片……",
      "source": {
        "code": "36kr",
        "name": "36氪",
        "url": "https://36kr.com/p/xxxxxx"
      },
      "publishedAt": "2026-11-08T02:10:00.000Z",
      "tags": ["AI", "芯片"],
      "importance": 88
    }
  ],
  "itemCount": 8,
  "sources": ["36kr", "ithome", "huxiu"],
  "inputWindow": {
    "start": "2026-11-07T06:30:00.000Z",
    "end": "2026-11-08T06:30:00.000Z",
    "lookbackHours": 24
  },
  "model": "deepseek-v4-flash",
  "searchProvidersUsed": [],
  "createdAt": "2026-11-08T00:41:00.000Z",
  "updatedAt": "2026-11-08T00:41:00.000Z"
}
```

- `highlights`、`items`、`sources`、`searchProvidersUsed` 始终是数组；`status` 为 `generating` / `failed` 时可能是空数组。
- `title`、`summary`、`model`、`error`、`createdAt`、`updatedAt` 等可选字段缺省时不返回，前端按可选处理。
- `inputWindow` 的 `start` / `end` 是 ISO 字符串；`itemCount` 等于 `items.length`，为 0 时也会返回。
- 单条 item 的可选字段（`publishedAt`、`tags`、`importance`、`extensions`）同样缺省时不返回。
- 默认不返回 `rawInputItems` 和 `searchEvidence`；`includeDebug=true` 才会返回。
- `searchProvidersUsed` 在搜索增强关闭时为空数组，开启后返回实际命中的平台。
- `digest` 与分页列表的响应结构见[数据结构](/reference/data-structures)，前端聚合、分页和状态处理建议见[新闻简报前端接入](/development/news-brief-frontend)。

## 测试命令

检查服务健康与配置：

```bash
curl http://localhost:6689/health
curl http://localhost:6689/api/news-briefs/config
curl http://localhost:6689/api/news-briefs/categories
curl http://localhost:6689/api/news-briefs/scheduler/status
```

验证只读接口在没有数据时返回空响应体：

```bash
curl -i 'http://localhost:6689/api/news-briefs/latest?category=tech'
curl -i 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech'
```

验证聚合与分页接口：

```bash
curl -s 'http://localhost:6689/api/news-briefs/digest?categories=finance,tech'
curl -s 'http://localhost:6689/api/news-briefs?page=1&limit=20&category=tech'
```

验证搜索增强配置与板块目录：

```bash
curl -s http://localhost:6689/api/news-briefs/config
curl -s http://localhost:6689/api/news-briefs/categories
```

验证删除接口的安全 no-op（期望 `deletedCount: 0`；只对确认过的环境执行）：

```bash
curl -X DELETE 'http://localhost:6689/api/news-briefs/1900-01-01?category=tech&period=manual-test'
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?beforeDate=1900-01-01'
```

验证手动生成接口默认被禁用（`NEWS_BRIEF_MANUAL_GENERATE_ENABLED=false` 时应返回 403）：

```bash
curl -i -X POST http://localhost:6689/api/news-briefs/generate
```

验证默认不返回调试字段（拿到数据后执行）：

```bash
curl -s 'http://localhost:6689/api/news-briefs/latest?category=tech' | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  const x = JSON.parse(s);
  console.log({
    hasRawInputItems: Object.prototype.hasOwnProperty.call(x, "rawInputItems"),
    hasSearchEvidence: Object.prototype.hasOwnProperty.call(x, "searchEvidence")
  });
});
'
```

验证条目结构完整（拿到数据后执行）：

```bash
curl -s 'http://localhost:6689/api/news-briefs/latest?category=tech' | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  const x = JSON.parse(s);
  console.log(x.items.map((item) => ({
    title: Boolean(item.title),
    summary: Boolean(item.summary),
    content: Boolean(item.content),
    source: item.source
  })));
});
'
```

## 注意事项

1. 修改 `.env` 后需要重启服务。
2. `NEWS_BRIEF_ENABLED` 只控制服务启动时是否注册新闻简报定时任务，不影响 `POST /generate`；手动生成由 `NEWS_BRIEF_MANUAL_GENERATE_ENABLED` 单独控制，且默认关闭。
3. 前端只应调用只读 `GET` 接口；`POST /generate`、调度器接口和两个 `DELETE` 路由都必须在网关层限制来源。
4. `NEWS_BRIEF_CATEGORIES` 中的未知板块会在启动配置校验阶段直接失败；修改后请重启并检查 `/api/news-briefs/config`。
5. 板块数据源之间可能重叠（如微博同时服务综合新闻和体育），同一事件可能出现在多个板块；跨板块去重尚未实现。
6. 体育板块依赖虎扑等论坛热帖加综合平台的体育话题，深度报道覆盖有限。
7. 生成失败不会写入空简报；force 重新生成失败时会保留此前的成功内容。
8. `includeDebug=true` 可能返回较大的响应体，不建议前端常规使用；分页列表接口不接受 `includeDebug`。
9. 搜索增强默认关闭，开启会产生额外的搜索费用；单个搜索失败会降级为空证据，不影响简报生成，有结果的查询缓存 1 小时。
10. 分页列表只返回摘要字段，不返回 `items`；需要条目内容时用 `:date` 查询单份简报。
11. `digest` 响应里的 `status=missing` 是读取层状态（该日期该板块没有记录），不是数据库状态。
12. 两个 `DELETE` 路由是**不可恢复**的破坏性操作且没有内建鉴权，执行前必须先做安全 no-op 检查。
