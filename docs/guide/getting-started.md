# 快速开始

本页介绍如何在本地启动 Daily Hot API，并完成第一条热榜和健康检查请求。

## 环境要求

- Node.js 20 或更高版本
- npm
- MongoDB（历史热点、调度持久化和每日简报需要）
- Redis（可选；不可用时部分缓存会降级到进程内存）

::: tip 想最快体验？
如果本机已经安装 Docker，直接使用 [Docker Compose](/operations/docker) 可以一次启动应用、MongoDB 和 Redis。
:::

## 安装

```bash
git clone https://github.com/HelTi/daily-hot-api.git
cd daily-hot-api
npm install
cp .env.example .env
```

默认配置适合本地开发。至少确认 MongoDB 和 Redis 的地址与你本机环境一致：

```dotenv
PORT=6688
MONGODB_URI=mongodb://localhost:27017/daily-hot-api
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
SCHEDULER_AUTO_START=false
BRIEF_ENABLED=false
```

完整配置见[环境变量参考](/reference/environment-variables)。

## 启动服务

开发模式会监听源码变化并自动重启：

```bash
npm run dev
```

服务默认监听 `http://localhost:6688`。如果 `.env` 中将 `PORT` 设置为其他值，请同步替换后续示例的端口。

## 验证

检查服务状态：

```bash
curl http://localhost:6688/health
```

正常响应包含：

```json
{
  "status": "ok",
  "timestamp": "2026-07-19T06:00:00.000Z",
  "uptime": 12.34,
  "checks": {
    "redis": true,
    "memory": {
      "used": 12345678,
      "total": 23456789
    }
  }
}
```

Redis 不可用时，`status` 可能为 `degraded`，但不一定影响实时热榜接口。

获取全部可用来源：

```bash
curl http://localhost:6688/hot-lists/all
```

获取知乎热榜：

```bash
curl 'http://localhost:6688/hot-lists/zhihu?limit=10'
```

## 生产运行

先构建再启动：

```bash
npm run build
npm run start:prod
```

生产环境还应确认 MongoDB 持久化、Redis 连接、CORS、任务开关以及 API Key 均已正确配置。部署方式可参考 [Docker 部署](/operations/docker)和 [PM2 部署](/operations/pm2)。

## 下一步

- [获取热榜](/guide/hot-lists)
- [查询历史热点](/guide/history)
- [管理定时任务](/guide/scheduler)
- [生成 AI 每日简报](/guide/daily-brief)
