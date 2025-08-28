# 动态定时任务配置说明

## 概述

现在支持从 `.env` 文件中动态配置定时任务的执行时间，基于 [NestJS 官方文档](https://docs.nestjs.com/techniques/task-scheduling#dynamic-cron-jobs) 实现，无需修改代码即可调整定时任务的执行频率。

## 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# 定时任务开关
SCHEDULER_AUTO_START=true

# 定时任务执行时间（cron 表达式）
SCHEDULER_CRON_EXPRESSION=0 */12 * * *
```

## 配置说明

### SCHEDULER_AUTO_START
- **类型**: boolean
- **默认值**: true
- **说明**: 控制是否在应用启动时自动启动定时任务
- **可选值**: 
  - `true`: 自动启动定时任务
  - `false`: 不自动启动，需要手动启动

### SCHEDULER_CRON_EXPRESSION
- **类型**: string
- **默认值**: `0 */12 * * *` (每12小时执行一次)
- **说明**: 标准的 cron 表达式，定义定时任务的执行频率

## 支持的 Cron 表达式格式

### 小时级别
```bash
# 每12小时执行一次（默认）
SCHEDULER_CRON_EXPRESSION=0 */12 * * *

# 每6小时执行一次
SCHEDULER_CRON_EXPRESSION=0 */6 * * *

# 每4小时执行一次
SCHEDULER_CRON_EXPRESSION=0 */4 * * *

# 每2小时执行一次
SCHEDULER_CRON_EXPRESSION=0 */2 * * *

# 每1小时执行一次
SCHEDULER_CRON_EXPRESSION=0 */1 * * *
```

### 分钟级别
```bash
# 每30分钟执行一次
SCHEDULER_CRON_EXPRESSION=*/30 * * * *

# 每15分钟执行一次
SCHEDULER_CRON_EXPRESSION=*/15 * * * *

# 每10分钟执行一次
SCHEDULER_CRON_EXPRESSION=*/10 * * * *

# 每5分钟执行一次
SCHEDULER_CRON_EXPRESSION=*/5 * * * *
```

### 特定时间
```bash
# 每天午夜执行一次
SCHEDULER_CRON_EXPRESSION=0 0 * * *

# 每天上午8点执行一次
SCHEDULER_CRON_EXPRESSION=0 8 * * *

# 每天下午2点执行一次
SCHEDULER_CRON_EXPRESSION=0 14 * * *
```

## 使用示例

### 开发环境配置
```bash
# .env
SCHEDULER_AUTO_START=false
SCHEDULER_CRON_EXPRESSION=*/5 * * * *
```

### 生产环境配置
```bash
# .env
SCHEDULER_AUTO_START=true
SCHEDULER_CRON_EXPRESSION=0 */6 * * *
```

### 测试环境配置
```bash
# .env
SCHEDULER_AUTO_START=true
SCHEDULER_CRON_EXPRESSION=0 */2 * * *
```

## API 接口

### 查看定时任务状态
```bash
curl http://localhost:6689/api/scheduler/status
```

响应示例：
```json
{
  "isRunning": false,
  "schedulerEnabled": true,
  "cronJobs": 1,
  "ignoreSources": ["v2ex", "github"],
  "cronExpression": "0 */12 * * *",
  "cronJobExists": true
}
```

### 手动启动定时任务
```bash
curl -X POST http://localhost:6689/api/scheduler/start
```

### 手动停止定时任务
```bash
curl -X POST http://localhost:6689/api/scheduler/stop
```

### 重新配置定时任务
```bash
curl -X POST http://localhost:6689/api/scheduler/reconfigure
```

### 手动触发数据抓取
```bash
# 抓取所有数据源
curl -X POST http://localhost:6689/api/scheduler/trigger

# 抓取特定数据源
curl -X POST http://localhost:6689/api/scheduler/trigger \
  -H "Content-Type: application/json" \
  -d '{"source": "zhihu"}'
```

## 技术实现

### 核心组件

1. **SchedulerRegistry**: NestJS 提供的定时任务注册表，用于管理动态定时任务
2. **CronJob**: 来自 `cron` 包的定时任务类，支持标准的 cron 表达式
3. **ConfigService**: 用于读取环境变量配置

### 实现原理

1. 在 `onModuleInit` 生命周期中读取环境变量配置
2. 使用 `CronJob` 创建定时任务实例
3. 通过 `SchedulerRegistry.addCronJob()` 注册定时任务
4. 支持运行时重新配置和停止/启动定时任务

### 代码示例

```typescript
// 创建动态定时任务
const job = new CronJob(cronExpression, () => {
  this.handleCron();
});

// 注册到 SchedulerRegistry
this.schedulerRegistry.addCronJob(this.cronJobName, job);
job.start();
```

## 注意事项

1. **Cron 表达式**: 使用标准的 cron 表达式格式，支持所有标准的 cron 语法
2. **重启生效**: 修改 `.env` 文件后需要重启应用才能生效
3. **日志监控**: 定时任务的执行情况会在日志中记录
4. **错误处理**: 如果配置的 cron 表达式无效，系统会记录错误日志
5. **资源管理**: 在应用销毁时会自动清理定时任务资源

## 日志示例

### 启动时的日志
```
[SchedulerService] Scheduler auto-start: enabled
[SchedulerService] Dynamic cron job setup with expression: 0 */12 * * *
```

### 执行时的日志
```
[SchedulerService] handleCron
[SchedulerService] Scheduling fetch for source: zhihu
[SchedulerService] Scheduling fetch for source: weibo
```

### 停止时的日志
```
[SchedulerService] Stopped cron job: hot-data-fetch
[SchedulerService] Scheduler disabled
```

## 参考文档

- [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling#dynamic-cron-jobs)
- [Cron Expression Format](https://crontab.guru/)
