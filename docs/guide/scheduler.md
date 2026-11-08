# 定时任务

项目有三套可独立控制的定时任务：热点抓取调度器、AI 每日简报调度器和通用新闻简报调度器。

## 热点抓取调度器

配置：

```dotenv
SCHEDULER_AUTO_START=false
SCHEDULER_CRON_EXPRESSION=0 */12 * * *
IGNORE_SAVE_SOURCES=v2ex,github
```

`SCHEDULER_AUTO_START` 决定应用启动时是否自动启动。运行期间可以通过 API 控制：

```bash
# 查看状态
curl http://localhost:6689/api/scheduler/status

# 启动
curl -X POST http://localhost:6689/api/scheduler/start

# 停止
curl -X POST http://localhost:6689/api/scheduler/stop

# 重新加载 Cron 配置
curl -X POST http://localhost:6689/api/scheduler/reconfigure
```

手动触发全部来源：

```bash
curl -X POST http://localhost:6689/api/scheduler/trigger
```

手动触发单个来源：

```bash
curl -X POST http://localhost:6689/api/scheduler/trigger \
  -H 'Content-Type: application/json' \
  -d '{"source":"zhihu"}'
```

手动触发立即返回 `202` 和 `runId`。用 `GET /api/scheduler/runs/:runId` 查询 `running`、`completed` 或 `failed`，完成后可看到各来源的成功状态、数量和错误；接口不会返回抓取的完整条目。记录只保存在接收请求的进程内，最多保留一小时，重启后消失。多实例部署时应通过同一实例查询任务状态。

```bash
curl http://localhost:6689/api/scheduler/runs/<runId>
```

## 来源级配置

来源配置保存在 MongoDB，包括是否启用、抓取间隔和最后抓取时间。

```bash
curl http://localhost:6689/api/scheduler/configs
```

修改知乎的配置：

```bash
curl -X PUT http://localhost:6689/api/scheduler/config/zhihu \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"interval":30}'
```

`interval` 单位是分钟，允许 1–10080。每次全局 Cron 触发时，调度器只抓取距上次成功刷新已达到来源间隔的源。修改间隔后在下一次 Cron 自动生效；手动触发不受间隔限制。`reconfigure` 只重新注册当前进程中的 Cron，不会重新读取 `.env`。

查看不会写入历史数据库的来源：

```bash
curl http://localhost:6689/api/scheduler/ignored-sources
```

## 每日简报调度器

配置：

```dotenv
BRIEF_ENABLED=false
BRIEF_CRON_EXPRESSION=0 12 * * *
BRIEF_TIMEZONE=Asia/Shanghai
```

运行时控制：

```bash
curl http://localhost:6689/api/briefs/scheduler/status
curl -X POST http://localhost:6689/api/briefs/scheduler/start
curl -X POST http://localhost:6689/api/briefs/scheduler/stop
curl -X POST http://localhost:6689/api/briefs/scheduler/reconfigure
```

简报调度会调用外部热榜、配置的搜索平台和模型服务。开发环境建议保持 `BRIEF_ENABLED=false`，需要时使用手动生成接口。

## 通用新闻简报调度器

配置：

```dotenv
NEWS_BRIEF_ENABLED=false
NEWS_BRIEF_CRON_EXPRESSION=30 8 * * *
NEWS_BRIEF_TIMEZONE=Asia/Shanghai
NEWS_BRIEF_CATEGORIES=finance,general,tech,sports
```

运行时控制：

```bash
curl http://localhost:6689/api/news-briefs/scheduler/status
curl -X POST http://localhost:6689/api/news-briefs/scheduler/start
curl -X POST http://localhost:6689/api/news-briefs/scheduler/stop
curl -X POST http://localhost:6689/api/news-briefs/scheduler/reconfigure
```

新闻简报调度按 `NEWS_BRIEF_CATEGORIES` 的顺序逐个板块生成；默认 `NEWS_BRIEF_CATEGORY_CONCURRENCY=1` 串行执行，避免同时向模型发起多次付费请求。开发环境建议保持 `NEWS_BRIEF_ENABLED=false`。手动生成接口由 `NEWS_BRIEF_MANUAL_GENERATE_ENABLED` 单独控制，默认关闭并返回 403。

与每日简报调度一样，`NEWS_BRIEF_ENABLED` 只决定进程启动时是否注册 Cron，运行期的启停可以通过上面的接口完成。

## 状态与持久性

- API 启停只改变当前 Node.js 进程的运行状态。
- 进程重启后会重新读取 `SCHEDULER_AUTO_START`、`BRIEF_ENABLED` 和 `NEWS_BRIEF_ENABLED`。
- 修改 `.env` 后必须重启服务；仅调用 `reconfigure` 不会让 `ConfigService` 重新读取文件。
- 多实例部署时，每个进程都会有自己的调度器。应只让一个实例启用自动任务，避免重复抓取和生成。
- 维护期间可先停止任务，操作结束后再启动，并检查状态接口。

调度器的代码结构与注册机制见[调度器实现](/development/scheduler)。
