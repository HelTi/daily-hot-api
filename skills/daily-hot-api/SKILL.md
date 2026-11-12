---
name: daily-hot-api
description: Fetch real-time trending/hot lists from 60+ Chinese and global platforms (Weibo 微博热搜, Zhihu 知乎热榜, Bilibili, Baidu, Douyin 抖音, Toutiao, Hacker News, GitHub, 财联社, 同花顺, etc.), search saved hot-item history, and read AI daily briefs through a local or self-hosted daily-hot-api service. Use when the user asks about 热搜/热榜/今日热点/舆情/趋势/榜单, what is trending on a Chinese platform, wants a cross-platform digest, or asks for a daily brief. Do not use for fetching full article text, scraping arbitrary URLs, or general web news without a hot-list source.
license: MIT
compatibility: Requires Node.js >= 22.20 and npx; npm registry and hot-list upstream sites must be reachable. First run downloads @ttkit/daily-hot-api (~1 MB) and starts a local service. Tested on Node 22.23.2 and 24.x; the CLI package itself declares >= 24.
metadata:
  author: Helti
  version: "1.1.1"
  homepage: https://helti.github.io/daily-hot-api/
  repository: https://github.com/HelTi/daily-hot-api
  cli-version: "0.1.5"
---

# daily-hot-api

给 agent 使用的每日热榜能力：聚合 60+ 个平台的热榜、支持历史热点检索和只读的 AI 每日简报。底层复用已发布的 npm CLI `@ttkit/daily-hot-api`，在本机按需启动一个隔离服务实例。

## 何时使用

用户提到以下意图时使用：

- 热搜、热榜、今日热点、全网热点、舆情、趋势、榜单
- 指定平台的热点：微博、知乎、B站、百度、抖音、头条、知乎日报、掘金、V2EX、Hacker News、GitHub、财联社、同花顺等
- 跨平台对比、汇总今天/本周热点、生成热点摘要或简报
- 查询历史热点（需要用户已配置 MongoDB 的实例）

不要用于：抓取文章正文、抓取任意 URL、评论内容、实时监控/推送、没有热榜来源的一般新闻检索。

## 第一步：自检

```bash
node scripts/daily-hot.mjs doctor
```

`doctor` 会输出 Node 版本、CLI 可用性、服务实例状态和建议。若 `status` 为 `ok` 或 `degraded` 即可继续；`blocked` 时按 `suggestions` 修复（通常是 Node 版本过低）。

## 快速开始

```bash
# 1. 确保服务可用（首次运行会通过 npx 下载 CLI 并启动隔离实例，约 5–20 秒）
node scripts/daily-hot.mjs ensure

# 2. 不知道有哪些来源时先列出
node scripts/daily-hot.mjs sources

# 3. 取热榜（默认 10 条，desc 已截断，适合直接阅读）
node scripts/daily-hot.mjs hot zhihu --limit 10
```

输出为 JSON，例如：

```json
{
  "source": "zhihu",
  "title": "知乎",
  "fromCache": true,
  "updatedAt": "2026-11-02T06:00:00.000Z",
  "total": 10,
  "items": [
    { "rank": 1, "title": "热点标题", "hot": 123456, "url": "https://..." }
  ]
}
```

## 服务实例解析顺序

脚本自动按以下顺序选择实例，不需要用户手动处理：

1. `--base-url` 或 `DAILY_HOT_API_BASE_URL`：连接用户已部署/自建的实例（只读）。
2. `~/.daily-hot-api-skill` 状态目录：连接本 skill 之前启动的隔离实例。
3. `http://127.0.0.1:6689`：用户自己用 CLI 启动的实例（只读，**绝不 stop**）。
4. 都没有时自动启动隔离实例：最小配置、随机/默认端口、不连接 Mongo、不开简报。

隔离实例的状态目录可用 `DAILY_HOT_API_SKILL_HOME` 覆盖。`stop` 只会停止带本 skill 启动标记的实例；停止失败时标记会保留，可以重试 `stop`。

## 常用命令

```bash
# 列出所有来源
node scripts/daily-hot.mjs sources

# 指定来源、条数、榜单类型；--no-cache 慎用
node scripts/daily-hot.mjs hot weibo --limit 20
node scripts/daily-hot.mjs hot baidu --type hot

# 来源专属参数（key 支持驼峰）
node scripts/daily-hot.mjs hot hupu --param page=2 --param pageSize=10

# 历史检索（需要 Mongo；隔离实例不可用，需连接自建实例）
node scripts/daily-hot.mjs history search --source zhihu --keyword AI \
  --start 2026-10-01 --end 2026-11-01 --limit 20

# 读取已生成的 AI 每日简报（只读，不触发生成）
node scripts/daily-hot.mjs brief latest
node scripts/daily-hot.mjs brief 2026-11-01 --period daily

# 查看实例状态 / 停止本 skill 启动的实例
node scripts/daily-hot.mjs status
node scripts/daily-hot.mjs stop
```

完整参数、退出码与响应结构见 [references/api.md](references/api.md)；来源清单见 [references/sources.md](references/sources.md)；错误处理见 [references/troubleshooting.md](references/troubleshooting.md)。

## 结果呈现规范

- 保留 `rank`、`title`、`hot`（热度值按原样展示）和 `url` 链接。
- 默认最多展示 10–20 条；用户要“全部”时再提高 `--limit`，不要一次输出几百条。
- 跨平台对比时按来源分组，注明每个来源的抓取时间（`updatedAt` / `fromCache`）。
- 数据是热榜快照，会缓存；需要最新数据时可用 `--no-cache`，但同一来源不要连续刷新。
- 只根据脚本返回的数据回答，不要补造标题、热度或链接。
- 简报返回 `note` 字段时（`generating` / `failed`）说明内容不完整，要如实告诉用户，不要当成完整简报。

## 安全与成本边界

- 不要打印、读取 `.env`、API Key、`~/.daily-hot-api-skill` 下的状态文件内容。
- 不要调用 `POST /api/briefs/generate` 或任何 `scheduler/*` 写接口；本 skill 只读。生成简报会消耗 AI 配额，必须由用户显式发起。
- 自动启动的实例只绑定 `127.0.0.1`（配置里写 `HOST=127.0.0.1`），不会暴露到局域网；配置里也没有 AI Key、没有 Mongo 连接，只暴露公开热榜数据。不要用带 AI Key 的 `.env` 给 skill 启动实例。
- 单次请求最多查 3 个来源；不要循环 `--no-cache` 刷上游导致被限流。
- 上游来源可能临时失败：如实告诉用户哪个来源失败，可换同类来源重试一次。

## 清理

- 服务在后台运行是正常的，方便同一会话后续查询。
- 用户明确要求、或任务结束时，执行 `node scripts/daily-hot.mjs stop` 停止本 skill 启动的实例；不要停止用户自己的实例。

## 排障

| 现象 | 处理 |
| --- | --- |
| `doctor` 报 Node 版本不满足 | 升级到 Node >= 22.20（推荐 24 LTS） |
| 首次 `ensure` 很慢 | npx 正在下载 CLI；网络受限时按 `references/troubleshooting.md` 配置 npm 镜像 |
| 端口被占用 | 脚本会自动换空闲端口；失败时查看输出的日志路径 |
| `/ready` 非 200、history 500 | MongoDB 未连接；实时热榜仍可用，历史/简报需自建实例 |
| `hot` 返回 404 | source 不存在，先运行 `sources` 确认 ID |
| 上游某来源失败 | 换同类来源或稍后重试，不要反复刷 |
