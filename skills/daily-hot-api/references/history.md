# 历史热点查询

历史热点依赖 MongoDB。**skill 自动启动的隔离实例故意不连 Mongo**，所以 history 默认不可用；要使用它，需要用户自己部署一个带 Mongo 的实例，然后让 skill 通过 `DAILY_HOT_API_BASE_URL` 连接。

## 前置条件

1. 服务实例配置了可用的 `MONGODB_URI`。
2. 调度器曾抓取并保存过热榜数据（或有人手动触发过抓取）。
3. `IGNORE_SAVE_SOURCES` 之外的来源才会写入历史库。
4. `/ready` 返回 200；否则 history 请求会 500/503。

检查实例是否具备历史能力：

```bash
node scripts/daily-hot.mjs doctor --base-url http://127.0.0.1:6689
# ready.ready=true 表示 Mongo 已连接
```

## 用户自建实例的最小步骤

```bash
# 任意目录
mkdir -p ~/daily-hot-api-run && cd ~/daily-hot-api-run
cp "$(npm root -g)/@ttkit/daily-hot-api/.env.example" .env
# 编辑 .env：MONGODB_URI=mongodb://127.0.0.1:27017/daily-hot-api
daily-hot-api start -d
```

或使用仓库的 docker-compose / Docker 部署，见
[部署文档](https://helti.github.io/daily-hot-api/operations/docker)。

然后：

```bash
export DAILY_HOT_API_BASE_URL=http://127.0.0.1:6689
node scripts/daily-hot.mjs history search --source zhihu --keyword AI
```

## 查询参数

```bash
node scripts/daily-hot.mjs history search \
  --source zhihu \
  --keyword AI \
  --start 2026-10-01 \
  --end 2026-11-01 \
  --page 1 \
  --limit 20 \
  --sort-by timestamp \
  --sort-order desc
```

| 参数 | 说明 |
| --- | --- |
| `--source` | 来源 ID，例如 `zhihu`；省略表示全部来源 |
| `--keyword` | 标题/描述字面量匹配，最多 100 字符；正则元字符按普通文本处理 |
| `--start` / `--end` | `YYYY-MM-DD`，按热点时间戳过滤 |
| `--page` | 页码，默认 1 |
| `--limit` | 每页 1–100，默认 20 |
| `--sort-by` | `timestamp`（默认）/ `title` / `createdAt` |
| `--sort-order` | `desc`（默认）/ `asc` |

## 输出

```json
{
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "items": [
    {
      "rank": 1,
      "source": "zhihu",
      "title": "热点标题",
      "hot": 88,
      "url": "https://...",
      "timestamp": 1762000000000,
      "desc": "截断后的摘要"
    }
  ]
}
```

## 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| HTTP 500 | 隔离实例没有 Mongo | 连接自建实例，或在实例的 `.env` 配置 `MONGODB_URI` |
| HTTP 503 | Mongo 未就绪 | 检查 Mongo 进程、连接串、`/ready` |
| 结果为空 | 没有历史抓取 | 在服务端启用来源并启动调度器，或等待定时任务 |
| 参数 400 | 日期格式/limit/page 越界 | 按上表修正 |

## 说明

- 历史条目是“首次见到”的快照，`hot` / `title` / `timestamp` 不会随时间改写。
- 启停调度器、抓取历史数据属于服务端运维操作，本 skill 不封装写接口。
- 更完整的接口说明见
  [历史热点文档](https://helti.github.io/daily-hot-api/guide/history)。
