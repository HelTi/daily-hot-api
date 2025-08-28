# 定时任务控制说明

## 问题说明

默认情况下，定时任务会在应用启动时自动开始运行。这是因为 NestJS 的 `@Cron` 装饰器会在模块初始化时自动启动定时任务。

## 解决方案

我们提供了两种方式来控制定时任务的启动：

### 1. 环境变量控制（推荐）

在 `.env` 文件中设置：

```bash
# 禁用定时任务自动启动
SCHEDULER_AUTO_START=false

# 启用定时任务自动启动（默认）
SCHEDULER_AUTO_START=true
```

### 2. API 接口控制

#### 启动定时任务
```bash
curl -X POST http://localhost:3000/api/scheduler/start
```

#### 停止定时任务
```bash
curl -X POST http://localhost:3000/api/scheduler/stop
```

#### 查看定时任务状态
```bash
curl http://localhost:3000/api/scheduler/status
```

响应示例：
```json
{
  "isRunning": false,
  "schedulerEnabled": true,
  "cronJobs": 1,
  "ignoreSources": ["v2ex", "github"]
}
```

## 使用场景

### 场景1：开发环境
在开发环境中，你可能不希望定时任务自动启动，避免产生测试数据：

```bash
# .env
SCHEDULER_AUTO_START=false
```

然后手动启动：
```bash
curl -X POST http://localhost:3000/api/scheduler/start
```

### 场景2：生产环境
在生产环境中，通常希望定时任务自动启动：

```bash
# .env
SCHEDULER_AUTO_START=true
```

### 场景3：临时停止
在需要维护或调试时，可以临时停止定时任务：

```bash
curl -X POST http://localhost:3000/api/scheduler/stop
```

维护完成后重新启动：
```bash
curl -X POST http://localhost:3000/api/scheduler/start
```

## 日志示例

### 启动时的日志
```
[SchedulerService] Scheduler auto-start: disabled
[SchedulerService] Ignoring sources for saving: v2ex, github
```

### 手动启动的日志
```
[SchedulerService] Scheduler enabled
```

### 手动停止的日志
```
[SchedulerService] Scheduler disabled
```

### 定时任务执行时的日志
```
[SchedulerService] Scheduling fetch for source: zhihu
[SchedulerService] Skipping ignored source: v2ex
```

## 注意事项

1. **环境变量优先级**: 环境变量 `SCHEDULER_AUTO_START` 的优先级高于手动控制
2. **重启生效**: 修改环境变量后需要重启服务才能生效
3. **状态持久性**: 手动启动/停止的状态在服务重启后会重置为环境变量配置
4. **实时控制**: API 接口可以实时控制定时任务，无需重启服务

## 完整配置示例

```bash
# .env
MONGODB_URI=mongodb://localhost:27017/daily-hot-api
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# 忽略保存的数据源
IGNORE_SAVE_SOURCES=v2ex,github,hostloc

# 定时任务控制
SCHEDULER_AUTO_START=false
```

这样配置后：
- 定时任务不会自动启动
- v2ex、github、hostloc 的数据不会被保存
- 可以通过 API 手动控制定时任务
- 仍然可以通过原有 API 获取实时数据
