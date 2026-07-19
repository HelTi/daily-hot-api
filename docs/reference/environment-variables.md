# 环境变量参考

以下配置来自项目的 `.env.example`、配置加载器和校验 Schema。表中的示例值以仓库自带 `.env.example` 为准。

## 服务与 HTTP

| 变量 | 示例值 | 说明 |
| --- | --- | --- |
| `PORT` | `6688` | HTTP 服务监听端口 |
| `ALLOWED_DOMAIN` | `*` | CORS 允许的 Origin |
| `ALLOWED_HOST` | `*` | 允许的主域名；当前配置保留用于主机限制 |
| `DISALLOW_ROBOT` | `true` | 是否禁止搜索引擎抓取 |
| `REQUEST_TIMEOUT` | `6000` | 上游 HTTP 请求超时，单位毫秒 |
| `USE_LOG_FILE` | `true` | 是否输出日志文件 |
| `RSS_MODE` | `false` | 是否让热榜接口默认返回 RSS |

## 缓存与数据库

| 变量 | 示例值 | 说明 |
| --- | --- | --- |
| `REDIS_HOST` | `127.0.0.1` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | 空 | Redis 密码 |
| `CACHE_TTL` | `3600` | 热榜缓存时间，单位秒 |
| `MONGODB_URI` | `mongodb://localhost:27017/daily-hot-api` | MongoDB 连接字符串 |

Redis 使用延迟连接，连接失败时不会阻止进程启动。历史热点和每日简报依赖 MongoDB 持久化。

## 热榜抓取与调度

| 变量 | 示例值 | 说明 |
| --- | --- | --- |
| `NOT_ALLOWED_REFRESH_SOURCE` | `github,bilibili` | 禁止客户端使用 `noCache=true` 强刷的来源 |
| `IGNORE_SAVE_SOURCES` | `v2ex,...` | 不写入历史数据库的来源，逗号分隔 |
| `SCHEDULER_AUTO_START` | `false` | 启动应用时是否自动启动热点调度器 |
| `SCHEDULER_CRON_EXPRESSION` | `0 */12 * * *` | 热点调度 Cron 表达式 |
| `BACKUP_CRON_EXPRESSION` | `0 1 * * *` | 历史备份 Cron 表达式 |

## 每日简报

| 变量 | 示例值 | 说明 |
| --- | --- | --- |
| `BRIEF_ENABLED` | `false` | 启动应用时是否启用简报调度 |
| `BRIEF_CRON_EXPRESSION` | `0 12 * * *` | 简报生成 Cron 表达式 |
| `BRIEF_TIMEZONE` | `Asia/Shanghai` | 简报日期和 Cron 时区 |
| `BRIEF_SOURCES` | `cls,yicai,...` | 参与简报的热榜来源 |
| `BRIEF_LOOKBACK_HOURS` | `24` | 历史热点回看窗口，单位小时 |
| `BRIEF_TOP_ITEMS_PER_SOURCE` | `10` | 每个来源最多参与分析的条目数 |
| `BRIEF_MAX_TOPICS` | `12` | 最多搜索增强的候选主题数 |
| `BRIEF_STOCK_RANKING_CACHE_TTL` | `43200` | 股票历史排名缓存秒数 |

## AI 与搜索服务

| 变量 | 示例值 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | `skxxx` | OpenAI SDK 兼容服务的密钥 |
| `OPENAI_API_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容 API Base URL |
| `AI_MODEL` | `deepseek-v4-flash` | 简报生成模型名 |
| `TAVILY_API_KEY` | `tvly-dev-xxx` | Tavily Search API Key |
| `TAVILY_MAX_RESULTS` | `5` | 每个搜索请求最多结果数 |

::: danger 密钥安全
不要提交真实 API Key，也不要在日志、Issue、构建产物或前端代码中暴露密钥。GitHub Pages 只托管静态文档，不应注入任何服务端密钥。
:::

## 修改配置

新增环境变量时必须同步修改：

1. `src/config/configuration.ts`
2. `src/config/validation.schema.ts`
3. `.env.example`
4. 本页对应配置表
