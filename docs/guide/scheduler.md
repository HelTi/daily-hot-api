# 定时任务

项目有两套可独立控制的定时任务：热点抓取调度器和 AI 每日简报调度器。

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
curl http://localhost:6688/api/scheduler/status

# 启动
curl -X POST http://localhost:6688/api/scheduler/start

# 停止
curl -X POST http://localhost:6688/api/scheduler/stop

# 重新加载 Cron 配置
curl -X POST http://localhost:6688/api/scheduler/reconfigure
```

手动触发全部来源：

```bash
curl -X POST http://localhost:6688/api/scheduler/trigger
```

手动触发单个来源：

```bash
curl -X POST http://localhost:6688/api/scheduler/trigger \
  -H 'Content-Type: application/json' \
  -d '{"source":"zhihu"}'
```

## 来源级配置

来源配置保存在 MongoDB，包括是否启用、抓取间隔和最后抓取时间。

```bash
curl http://localhost:6688/api/scheduler/configs
```

修改知乎的配置：

```bash
curl -X PUT http://localhost:6688/api/scheduler/config/zhihu \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"interval":30}'
```

`interval` 单位是分钟。修改后可调用 `/api/scheduler/reconfigure` 让动态任务重新加载。

查看不会写入历史数据库的来源：

```bash
curl http://localhost:6688/api/scheduler/ignored-sources
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
curl http://localhost:6688/api/briefs/scheduler/status
curl -X POST http://localhost:6688/api/briefs/scheduler/start
curl -X POST http://localhost:6688/api/briefs/scheduler/stop
curl -X POST http://localhost:6688/api/briefs/scheduler/reconfigure
```

简报调度会调用外部热榜、Tavily 和模型服务。开发环境建议保持 `BRIEF_ENABLED=false`，需要时使用手动生成接口。

## 状态与持久性

- API 启停只改变当前 Node.js 进程的运行状态。
- 进程重启后会重新读取 `SCHEDULER_AUTO_START` 和 `BRIEF_ENABLED`。
- 修改 `.env` 后必须重启服务；仅调用 `reconfigure` 不会让 `ConfigService` 重新读取文件。
- 多实例部署时，每个进程都会有自己的调度器。应只让一个实例启用自动任务，避免重复抓取和生成。
- 维护期间可先停止任务，操作结束后再启动，并检查状态接口。

调度器的代码结构与注册机制见[调度器实现](/development/scheduler)。
