# daily-hot-api skill 接口契约

本文件是 `scripts/daily-hot.mjs` 的命令参考，以及脚本封装的服务端 API 说明。上游完整 API 见 [docs/reference/api.md](https://github.com/HelTi/daily-hot-api/blob/main/docs/reference/api.md)。

## 脚本命令

所有命令输出 JSON 到 stdout，诊断写 stderr；默认非交互、幂等。

| 命令 | 作用 | 主要选项 |
| --- | --- | --- |
| `doctor` | 环境/实例自检，不启动服务 | `--base-url` |
| `ensure` | 确保有可用实例，必要时启动隔离实例 | `--base-url` |
| `status` | 查看实例来源与 health/ready | `--base-url` |
| `sources` | 列出全部热榜来源 | `--base-url` |
| `hot <source>` | 获取实时热榜 | `--limit` `--type` `--param` `--no-cache` `--full` `--base-url` |
| `history search` | 搜索历史热点（需 Mongo） | `--source` `--keyword` `--start` `--end` `--page` `--limit` `--sort-by` `--sort-order` `--base-url` |
| `brief [latest\|YYYY-MM-DD]` | 读取已生成的 AI 简报（只读） | `--date` `--period` `--full` `--base-url` |
| `stop` | 停止本 skill 启动的实例 | — |

通用选项：`--json`（兼容占位）、`-h/--help`、`-v/--version`。

环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DAILY_HOT_API_BASE_URL` | 空 | 连接已有实例，优先级最高 |
| `DAILY_HOT_API_SKILL_HOME` | `~/.daily-hot-api-skill` | 本 skill 隔离状态目录 |
| `DAILY_HOT_API_CLI` | 空 | 指定 `daily-hot-api` 可执行文件 |
| `DAILY_HOT_API_LOCAL_PORT` | `6689` | 默认探测/启动端口；用户实例跑在自定义端口时用它自动发现 |

## 退出码

| 码 | 含义 | agent 建议动作 |
| --- | --- | --- |
| 0 | 成功 | 继续 |
| 2 | 用法错误 / source 不存在 / 4xx | 修正参数，先 `sources` 确认 ID |
| 3 | 前置条件不满足（Node、CLI 启动失败） | 按 stderr 建议修复，不要反复重试 |
| 4 | 服务/上游失败（网络、超时、5xx） | 最多重试一次；仍失败则说明原因 |
| 5 | 服务未运行 | 运行 `ensure` 或设置 `DAILY_HOT_API_BASE_URL` |

## 实例解析顺序

1. `--base-url` / `DAILY_HOT_API_BASE_URL`：用户已有实例（只读）。
2. `DAILY_HOT_API_SKILL_HOME` 中 CLI 状态文件指向的实例（本 skill 启动）。
3. `http://127.0.0.1:6689`：用户自己启动的实例（只读，不 stop）。
4. 自动启动隔离实例：最小配置，不连 Mongo，不开简报。

`stop` 只停第 2 种；其余一律不碰。

## 封装的服务端接口

### 健康检查

```http
GET /health
```

```json
{ "status": "ok", "checks": { "redis": true, "memory": { "used": 1, "total": 2 } } }
```

- `status: degraded` 表示 Redis 等非关键依赖异常，服务仍可用。
- `/health` 只代表进程可用。

```http
GET /ready
```

- 200：MongoDB 已连接。
- 503：MongoDB 未连接。实时热榜可用，历史/简报不可用。

### 来源列表

```http
GET /hot-lists/all
```

```json
{
  "code": 200,
  "count": 64,
  "routes": [{ "name": "zhihu", "title": "知乎", "path": "/zhihu" }]
}
```

`routes` 是动态注册结果，以它为准，不要硬编码 64 个来源。

### 实时热榜

```http
GET /hot-lists/:source
```

通用查询参数：

| 参数 | 说明 |
| --- | --- |
| `limit` | 条数；脚本默认 10，最大 100 |
| `noCache` | `true` 时尝试刷新；受 `NOT_ALLOWED_REFRESH_SOURCE` 限制 |
| `type` | 部分来源支持的榜单类型 |
| `rss` | 返回 RSS XML（脚本未封装） |

来源专属参数（脚本用 `--param key=value` 透传）：`nytimes.area`、`history.month/day`、`weatheralarm.province`、`hupu.type/page/pageSize/cursor`、`miyoushe.game`。未知参数会被服务端 400 拒绝。

典型响应：

```json
{
  "code": 200,
  "name": "zhihu",
  "title": "知乎",
  "type": "热榜",
  "link": "https://www.zhihu.com/hot",
  "fromCache": true,
  "updateTime": "2026-11-02T06:00:00.000Z",
  "total": 10,
  "data": [
    { "id": "1", "title": "标题", "desc": "摘要（可能很长）", "hot": 123, "url": "https://..." }
  ]
}
```

脚本输出会瘦身为 `{source,title,type,fromCache,updatedAt,items:[{rank,title,hot,url,desc?}]}`：

- `desc` 截断到 160 字符；
- 去掉 `mobileUrl`、`cover` 等冗余字段；
- `--full` 才返回原始响应。

### 历史热点

```http
GET /api/history/search
```

| 参数 | 说明 |
| --- | --- |
| `source` | 来源 ID |
| `keyword` | 标题/描述字面量关键词，≤100 字符 |
| `startDate` / `endDate` | `YYYY-MM-DD` |
| `page` | ≥1，默认 1 |
| `limit` | 1–100，默认 20 |
| `sortBy` | `timestamp` / `title` / `createdAt` |
| `sortOrder` | `asc` / `desc` |

响应：`{ data: [...], total, page, limit, totalPages }`。脚本把 `data` 映射为 `items` 并截断 `desc`。

> 需要 MongoDB。隔离实例故意不连 Mongo，因此 history 会返回 500；这不是脚本 bug。

### 每日简报（只读）

```http
GET /api/briefs/config        # { enabled: boolean, ... }
GET /api/briefs/latest?period=daily
GET /api/briefs/:date?period=daily
```

简报响应包含 `briefDate`、`period`、`status`、`sources`、`analysis`、`markdown`、`model` 等字段；`rawInputItems` / `searchEvidence` 默认不返回。

脚本输出：`{found, briefDate, period, status, sources, summary, highlights, topicCount, markdown, model}`。`markdown` 默认截断到 6000 字符，`--full` 返回完整内容。

> 本 skill 不封装 `POST /api/briefs/generate` 和 `scheduler/*` 写接口：生成会消耗 AI/Tavily 配额，必须由用户显式发起。

## 缓存与限流

- 默认走服务端缓存（`CACHE_TTL` 默认 3600 秒）。
- 不要循环 `--no-cache`；默认 `NOT_ALLOWED_REFRESH_SOURCE` 会拦截部分来源的强制刷新。
- 单次任务建议最多查询 3 个来源，避免触发上游风控。
