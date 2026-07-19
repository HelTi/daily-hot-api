# 每日简报功能说明

每日简报用于从配置的数据源中抓取热点内容，结合 Tavily 搜索增强和 OpenAI SDK 生成结构化产业简报。第一版重点面向财经、产业链和 A 股关联分析。

## 功能概览

生成链路：

```text
定时或手动触发
  -> 读取 BRIEF_SOURCES
  -> 刷新热点源数据并保存历史
  -> 读取最近 BRIEF_LOOKBACK_HOURS 的热点
  -> Tavily 搜索补充背景材料
  -> OpenAI SDK 生成结构化 JSON 和 Markdown
  -> 保存到 MongoDB
  -> API 返回前端可用的简报内容
```

默认面向前端的响应不会返回 `rawInputItems` 和 `searchEvidence`。这两个字段仍会保存到数据库，用于后端排查和审计，需要显式传 `includeDebug=true` 才会返回。

## 环境变量

```bash
# 每日简报配置
BRIEF_ENABLED=true
BRIEF_CRON_EXPRESSION=0 12 * * *
BRIEF_TIMEZONE=Asia/Shanghai
BRIEF_SOURCES=cls,yicai,wallstreet,jin10,tonghuashun,eastmoney,gelonghui
BRIEF_LOOKBACK_HOURS=24
BRIEF_TOP_ITEMS_PER_SOURCE=10
BRIEF_MAX_TOPICS=12
BRIEF_STOCK_RANKING_CACHE_TTL=43200

# OPENAI 配置
OPENAI_API_KEY=skxxx
OPENAI_API_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash

# Tavily Search API Key
TAVILY_API_KEY=tvly-dev-xxx
TAVILY_MAX_RESULTS=5
```

字段说明：

| 配置 | 说明 |
| --- | --- |
| `BRIEF_ENABLED` | 是否在服务启动时启用每日简报定时任务 |
| `BRIEF_CRON_EXPRESSION` | 简报生成 cron 表达式，默认每天 12 点 |
| `BRIEF_TIMEZONE` | 简报日期和定时任务使用的时区 |
| `BRIEF_SOURCES` | 参与简报的数据源名称，逗号分隔 |
| `BRIEF_LOOKBACK_HOURS` | 读取历史热点的回看窗口 |
| `BRIEF_TOP_ITEMS_PER_SOURCE` | 每个源最多纳入多少条热点，默认只分析前 10 条 |
| `BRIEF_MAX_TOPICS` | 最多对多少个候选主题做 Tavily 搜索增强 |
| `BRIEF_STOCK_RANKING_CACHE_TTL` | 股票历史排名接口缓存时长（秒），默认 `43200`（12 小时） |
| `OPENAI_API_KEY` | OpenAI SDK 使用的 API Key |
| `OPENAI_API_BASE_URL` | 兼容 OpenAI 协议的 API Base URL |
| `AI_MODEL` | 生成简报使用的模型 |
| `TAVILY_API_KEY` | Tavily 搜索 API Key |
| `TAVILY_MAX_RESULTS` | 每个搜索请求最多返回多少条结果 |

## 数据结构

简报保存在 MongoDB 的 `dailybriefs` collection 中，核心字段包括：

```ts
{
  briefDate: string;
  period: string;
  status: 'generating' | 'success' | 'failed';
  sources: string[];
  inputWindow: {
    start: Date;
    end: Date;
    lookbackHours: number;
  };
  analysis: Record<string, unknown>;
  markdown: string;
  rawInputItems: Record<string, unknown>[];
  searchEvidence: Record<string, unknown>[];
  model: string;
  tavilyUsed: boolean;
  error?: string;
}
```

`briefDate + period` 有唯一索引，用于避免同一天同一类型简报重复写入。

`analysis` 里包含：

- `summary`：核心结论
- `highlights`：重点摘要
- `topics`：主题拆解
- `risks`：整体风险
- `followUpSignals`：后续跟踪信号
- `markdown`：可直接展示的 Markdown 内容

## API 接口

基础地址示例：

```text
http://localhost:6688
```

### 获取简报配置

```bash
curl http://localhost:6688/api/briefs/config
```

响应示例：

```json
{
  "enabled": true,
  "cronExpression": "0 12 * * *",
  "timezone": "Asia/Shanghai",
  "sources": ["cls", "yicai", "wallstreet"],
  "lookbackHours": 24,
  "topItemsPerSource": 10,
  "maxTopics": 12,
  "stockRankingCacheTtl": 43200,
  "model": "deepseek-v4-flash",
  "tavilyConfigured": true
}
```

### 手动生成简报

生成正式日报：

```bash
curl -X POST http://localhost:6688/api/briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"force":true}'
```

指定数据源和 period，用于测试：

```bash
curl -X POST http://localhost:6688/api/briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"sources":["cls"],"period":"manual-test","force":true}'
```

请求参数：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `date` | string | 可选，格式 `YYYY-MM-DD` |
| `period` | string | 可选，默认 `daily` |
| `sources` | string[] | 可选，覆盖 `.env` 中的 `BRIEF_SOURCES` |
| `force` | boolean | 可选，是否强制重新生成 |

默认返回前端可用字段，不包含 `rawInputItems` 和 `searchEvidence`。

### 获取最新简报

```bash
curl http://localhost:6688/api/briefs/latest
```

不传 `period` 时，返回所有成功简报中最新的一条。

只获取正式日报：

```bash
curl 'http://localhost:6688/api/briefs/latest?period=daily'
```

获取调试字段：

```bash
curl 'http://localhost:6688/api/briefs/latest?includeDebug=true'
```

### 获取指定日期简报

```bash
curl 'http://localhost:6688/api/briefs/2026-07-05'
```

指定 period：

```bash
curl 'http://localhost:6688/api/briefs/2026-07-05?period=manual-test'
```

包含调试字段：

```bash
curl 'http://localhost:6688/api/briefs/2026-07-05?period=manual-test&includeDebug=true'
```

### 分页查询简报

```bash
curl 'http://localhost:6688/api/briefs?page=1&limit=10'
```

按 period 查询：

```bash
curl 'http://localhost:6688/api/briefs?period=daily&page=1&limit=10'
```

按状态查询：

```bash
curl 'http://localhost:6688/api/briefs?status=success'
```

### 获取历史股票出现次数排名

统计成功简报中 `analysis.topics[].aShareMapping[]` 的股票出现次数，并按次数从高到低返回排名：

```bash
curl 'http://localhost:6688/api/briefs/statistics/stocks'
```

支持按 `period`、简报日期范围和返回数量筛选：

```bash
curl 'http://localhost:6688/api/briefs/statistics/stocks?period=daily&startDate=2026-01-01&endDate=2026-07-18&limit=20'
```

接口按完整查询条件缓存结果，默认缓存 12 小时。缓存复用现有缓存模块（Redis 不可用时降级为进程内存缓存）；成功生成简报或实际删除简报后，会清理股票排名缓存。

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `period` | string | 全部 | 只统计指定类型的成功简报 |
| `startDate` | string | 不限制 | 起始简报日期，格式 `YYYY-MM-DD`，包含当天 |
| `endDate` | string | 不限制 | 截止简报日期，格式 `YYYY-MM-DD`，包含当天 |
| `limit` | number | `50` | 返回排名数量，范围 `1-200` |

响应示例：

```json
{
  "filters": {
    "period": "daily",
    "startDate": "2026-01-01",
    "endDate": "2026-07-18",
    "limit": 20
  },
  "summary": {
    "briefCount": 120,
    "uniqueStockCount": 86,
    "totalAppearances": 438
  },
  "rankings": [
    {
      "rank": 1,
      "company": "拓普集团",
      "code": "601689",
      "appearanceCount": 18,
      "briefCount": 13,
      "firstAppearedDate": "2026-01-08",
      "lastAppearedDate": "2026-07-17"
    }
  ]
}
```

统计口径：

- 仅统计 `status=success` 的历史简报。
- 同一股票每出现在一个主题的 `aShareMapping` 中一次，`appearanceCount` 增加一次。
- `briefCount` 是包含该股票的不同简报数量；同一简报内出现多次只计一份简报。
- 优先按去除空格并转为大写的股票代码合并；代码为空、`待验证` 或无效占位值时，按公司名合并。
- 没有有效股票代码和公司名的映射会被忽略。
- 次数相同时，依次按覆盖简报数、最近出现日期、股票代码和公司名排序。

### 删除指定日期简报

删除某一天所有 period 的简报：

```bash
curl -X DELETE http://localhost:6688/api/briefs/2026-07-05
```

只删除某一天的指定 period：

```bash
curl -X DELETE 'http://localhost:6688/api/briefs/2026-07-05?period=manual-test'
```

响应示例：

```json
{
  "mode": "date",
  "briefDate": "2026-07-05",
  "period": "manual-test",
  "deletedCount": 1
}
```

### 批量清理历史简报

按保留周期清理：

```bash
# 删除早于 1 个月前的简报
curl -X DELETE 'http://localhost:6688/api/briefs/history?olderThan=1m'

# 删除早于 1 年前的简报
curl -X DELETE 'http://localhost:6688/api/briefs/history?olderThan=1y'

# 删除早于 30 天前的简报
curl -X DELETE 'http://localhost:6688/api/briefs/history?olderThan=30d'
```

按截止日期清理：

```bash
# 删除 briefDate 小于 2025-07-05 的简报
curl -X DELETE 'http://localhost:6688/api/briefs/history?beforeDate=2025-07-05'
```

只清理指定 period：

```bash
curl -X DELETE 'http://localhost:6688/api/briefs/history?olderThan=1y&period=daily'
```

响应示例：

```json
{
  "mode": "olderThan",
  "olderThan": "1y",
  "beforeDate": "2025-07-05",
  "period": "daily",
  "deletedCount": 12
}
```

`olderThan` 支持：

- `30d`：30 天前
- `1m`：1 个月前
- `1y`：1 年前
- `month` / `one-month`：等价于 `1m`
- `year` / `one-year`：等价于 `1y`

### 简报调度状态

```bash
curl http://localhost:6688/api/briefs/scheduler/status
```

响应示例：

```json
{
  "isRunning": false,
  "enabled": true,
  "cronExpression": "0 12 * * *",
  "timezone": "Asia/Shanghai",
  "cronJobExists": true
}
```

### 启停简报调度

启动：

```bash
curl -X POST http://localhost:6688/api/briefs/scheduler/start
```

停止：

```bash
curl -X POST http://localhost:6688/api/briefs/scheduler/stop
```

重新加载 cron 配置：

```bash
curl -X POST http://localhost:6688/api/briefs/scheduler/reconfigure
```

## 前端响应字段

默认响应适合前端直接使用，核心字段如下：

```json
{
  "briefDate": "2026-07-05",
  "period": "daily",
  "status": "success",
  "sources": ["cls"],
  "inputWindow": {
    "start": "2026-07-04T04:00:00.000Z",
    "end": "2026-07-05T04:00:00.000Z",
    "lookbackHours": 24
  },
  "analysis": {
    "summary": "今日核心结论...",
    "highlights": [],
    "topics": [],
    "risks": [],
    "followUpSignals": [],
    "markdown": "# 每日热点简报..."
  },
  "markdown": "# 每日热点简报...",
  "model": "deepseek-v4-flash",
  "tavilyUsed": true,
  "createdAt": "2026-07-05T06:00:00.000Z",
  "updatedAt": "2026-07-05T06:01:00.000Z"
}
```

默认不返回：

- `rawInputItems`
- `searchEvidence`

需要排查生成输入或搜索证据时，使用 `includeDebug=true`。

## 测试命令

检查服务健康：

```bash
curl http://localhost:6688/health
```

检查配置：

```bash
curl http://localhost:6688/api/briefs/config
```

用财联社单源生成测试简报：

```bash
curl -X POST http://localhost:6688/api/briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"sources":["cls"],"period":"manual-test","force":true}'
```

验证默认不返回调试字段：

```bash
curl -s http://localhost:6688/api/briefs/latest | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const x = JSON.parse(s);
  console.log({
    hasRawInputItems: Object.prototype.hasOwnProperty.call(x, "rawInputItems"),
    hasSearchEvidence: Object.prototype.hasOwnProperty.call(x, "searchEvidence")
  });
});
'
```

验证调试字段可按需返回：

```bash
curl -s 'http://localhost:6688/api/briefs/latest?includeDebug=true' | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const x = JSON.parse(s);
  console.log({
    rawInputItems: x.rawInputItems?.length,
    searchEvidence: x.searchEvidence?.length
  });
});
'
```

## 注意事项

1. 修改 `.env` 后需要重启服务。
2. `BRIEF_ENABLED=true` 只控制服务启动时是否自动注册简报定时任务。
3. 手动启停调度只在当前进程内生效，服务重启后会重新读取 `.env`。
4. `POST /api/briefs/generate` 会调用热点源、Tavily 和模型，耗时可能达到几十秒。
5. `includeDebug=true` 可能返回较大的响应体，不建议前端常规使用。
6. A 股关联由模型基于热点和搜索证据生成，代码会提示模型不确定时标记为 `待验证`，但展示层仍建议保留风险提示。
7. 删除接口会直接删除 MongoDB 中的简报记录，操作前建议先用分页查询接口确认范围。
