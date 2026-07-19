# API 接口参考

默认服务地址为 `http://localhost:6688`。项目没有统一的 `/api` 全局前缀：实时热榜使用 `/hot-lists`，历史、调度和简报接口使用 `/api/*`。

## 健康检查

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | 服务首页 |
| `GET` | `/health` | 进程、内存和 Redis 健康状态 |

```bash
curl http://localhost:6688/health
```

Redis 不可用时可能返回 `status: "degraded"`。

## 实时热榜

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/hot-lists/all` | 获取所有已注册来源 |
| `GET` | `/hot-lists/:source` | 获取指定来源热榜 |

通用查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | :---: | --- |
| `limit` | number | 否 | 限制返回条数 |
| `noCache` | boolean | 否 | 是否尝试绕过缓存 |
| `rss` | boolean | 否 | 是否返回 RSS XML |
| `type` | string | 否 | 部分来源支持的榜单类别 |

```bash
curl 'http://localhost:6688/hot-lists/zhihu?limit=10&noCache=false'
```

详细说明见[获取热榜](/guide/hot-lists)。

## 历史热点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/history/search` | 搜索和分页查询历史热点 |
| `GET` | `/api/history/sources` | 获取已保存的数据源列表 |
| `GET` | `/api/history/stats` | 获取热点数据统计 |
| `GET` | `/api/history/configs` | 获取来源抓取配置 |
| `GET` | `/api/history/latest` | 获取最新历史热点 |
| `GET` | `/api/history/range/:source/:startTime/:endTime` | 按 Unix 毫秒时间戳范围查询 |

`GET /api/history/search` 查询参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `source` | string | 全部 | 来源 ID |
| `keyword` | string | 无 | 标题和描述关键词 |
| `startDate` | date | 无 | 开始日期，ISO 日期字符串 |
| `endDate` | date | 无 | 结束日期，ISO 日期字符串 |
| `page` | number | `1` | 页码，最小为 1 |
| `limit` | number | `20` | 每页条数，范围 1–100 |
| `sortBy` | string | `timestamp` | `timestamp`、`title` 或 `createdAt` |
| `sortOrder` | string | `desc` | `asc` 或 `desc` |

```bash
curl 'http://localhost:6688/api/history/search?source=zhihu&keyword=AI&page=1&limit=10'
```

详细说明见[历史热点](/guide/history)。

## 热点抓取调度器

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/scheduler/status` | 获取运行状态 |
| `GET` | `/api/scheduler/ignored-sources` | 获取不保存的来源 |
| `GET` | `/api/scheduler/configs` | 获取全部来源配置 |
| `POST` | `/api/scheduler/start` | 启动调度器 |
| `POST` | `/api/scheduler/stop` | 停止调度器 |
| `POST` | `/api/scheduler/trigger` | 立即抓取全部或指定来源 |
| `POST` | `/api/scheduler/reconfigure` | 根据当前配置重新注册 Cron |
| `PUT` | `/api/scheduler/config/:source` | 更新来源的启用状态或抓取间隔 |

立即抓取单个来源：

```bash
curl -X POST http://localhost:6688/api/scheduler/trigger \
  -H 'Content-Type: application/json' \
  -d '{"source":"zhihu"}'
```

更新来源配置：

```bash
curl -X PUT http://localhost:6688/api/scheduler/config/zhihu \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"interval":30}'
```

## AI 每日简报

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/briefs/generate` | 手动生成简报 |
| `GET` | `/api/briefs/config` | 获取非敏感简报配置 |
| `GET` | `/api/briefs/latest` | 获取最新成功简报 |
| `GET` | `/api/briefs` | 分页查询简报 |
| `GET` | `/api/briefs/statistics/stocks` | 获取历史股票出现次数排名 |
| `GET` | `/api/briefs/:date` | 获取指定日期简报 |
| `DELETE` | `/api/briefs/:date` | 删除指定日期简报 |
| `DELETE` | `/api/briefs/history` | 按日期或保留周期批量清理 |
| `GET` | `/api/briefs/scheduler/status` | 获取简报调度状态 |
| `POST` | `/api/briefs/scheduler/start` | 启动简报调度器 |
| `POST` | `/api/briefs/scheduler/stop` | 停止简报调度器 |
| `POST` | `/api/briefs/scheduler/reconfigure` | 重新注册简报 Cron |

生成测试简报：

```bash
curl -X POST http://localhost:6688/api/briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"sources":["cls"],"period":"manual-test","force":true}'
```

::: warning 调试字段
`includeDebug=true` 会返回体积较大的 `rawInputItems` 和 `searchEvidence`，只应在后端排查时使用，常规前端请求不要携带。
:::

::: danger 删除接口
`DELETE` 路由会直接删除 MongoDB 记录。执行前先通过查询接口确认日期和 `period`，并优先用 `1900-01-01` 做 `deletedCount: 0` 的安全检查。
:::

每日简报的请求参数、响应字段和清理规则见[AI 每日简报](/guide/daily-brief)。

## 校验与错误

服务启用了全局请求校验：

- 查询参数会根据 DTO 做类型转换。
- 未声明字段通常会被移除或拒绝。
- `forbidNonWhitelisted` 已启用，DTO 不接受的请求体字段会得到 `400 Bad Request`。
- 不存在的热榜来源返回 `404 Not Found`。
- 单个上游热榜抓取失败时，实时热榜接口可能返回 `200`、空数组和 `message`，调用方应检查响应内容。
