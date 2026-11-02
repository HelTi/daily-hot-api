# AI 每日简报（只读）

本 skill 只读取**已经生成好**的简报，不触发生成。生成会调用 AI/Tavily/DeepSeek 等付费接口，必须由用户显式发起。

## 前置条件

1. 连接一个已配置简报的实例（`DAILY_HOT_API_BASE_URL`）。
2. 该实例开启 `BRIEF_ENABLED=true`，配置了 `OPENAI_API_KEY` / `OPENAI_API_BASE_URL` / `AI_MODEL` 等。
3. 已至少成功生成过一份简报（`status=success`）。
4. `/ready` 为 200（简报存 MongoDB）。

隔离实例不满足以上任何一条，因此 skill 自动启动时简报不可用。

## 命令

```bash
# 最新一份
node scripts/daily-hot.mjs brief latest

# 指定日期与周期
node scripts/daily-hot.mjs brief 2026-11-01 --period daily

# 返回完整 markdown（默认截断到 6000 字符）
node scripts/daily-hot.mjs brief latest --full
```

## 输出

```json
{
  "found": true,
  "briefDate": "2026-11-02",
  "period": "daily",
  "status": "success",
  "sources": ["cls", "yicai"],
  "updatedAt": "2026-11-02T12:00:00.000Z",
  "summary": "一句话摘要",
  "highlights": ["要点一", "要点二"],
  "topicCount": 8,
  "markdown": "## 今日简报 ...",
  "model": "deepseek-v4-flash",
  "tavilyUsed": true
}
```

没有简报时返回 `{ "found": false, "message": "..." }`。

## 只读接口

```http
GET /api/briefs/config
GET /api/briefs/latest?period=daily
GET /api/briefs/:date?period=daily
```

- `config` 返回 `{ enabled, ... }`，`enabled` 来自调度器实时状态。
- `:date` 格式 `YYYY-MM-DD`；`period` 默认 `daily`。
- 默认不返回 `rawInputItems` / `searchEvidence`；本 skill 也不请求 `includeDebug=true`。

## 成本与安全

- 本 skill 不调用 `POST /api/briefs/generate`、`DELETE /api/briefs/history`、`scheduler/*` 等写接口。
- 服务端这些接口没有内置鉴权，部署时应在反向代理/网关层限制访问。
- 简报内容是 AI 生成的分析，转发给用户时应注明来源与生成日期，不要把 `topics` 里的公司映射当作投资建议。
- 如果用户要求“生成今天的简报”，说明需要用户先在自己的实例上手动触发，并提醒可能消耗 AI 配额。

## 配置参考

服务端环境变量与生成链路见
[每日简报文档](https://helti.github.io/daily-hot-api/guide/daily-brief)：

- `BRIEF_ENABLED`、`BRIEF_SOURCES`、`BRIEF_CRON_EXPRESSION`、`BRIEF_TIMEZONE`
- `OPENAI_API_KEY`、`OPENAI_API_BASE_URL`、`AI_MODEL`
- `TAVILY_API_KEY` / `DEEPSEEK_SEARCH_API_KEY`、`BRIEF_SEARCH_PROVIDERS`
