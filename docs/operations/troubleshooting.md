# 故障排查

## 服务无法启动

先检查构建和配置：

```bash
npm run build
```

常见原因：

- Node.js 版本低于 20。
- `.env` 中数字或布尔值不符合配置 Schema。
- 端口已被占用。
- `dist` 尚未构建却直接运行了 `npm run start:prod`。

临时换端口验证：

```bash
PORT=6699 BRIEF_ENABLED=false npm run start:prod
```

## 健康检查 degraded

```bash
curl http://localhost:6688/health
```

如果 `checks.redis` 为 `false`：

1. 检查 `REDIS_HOST`、`REDIS_PORT` 和 `REDIS_PASSWORD`。
2. 在 Docker 中执行 `docker compose ps redis` 和 `docker compose logs redis`。
3. 确认应用容器内不能用 `127.0.0.1` 访问另一个 Redis 容器，应使用服务名 `redis`。

Redis 故障不一定阻止实时热榜工作，但缓存可能退化为单进程内存。

## 历史查询或简报数据库错误

检查 MongoDB：

```bash
docker compose ps mongodb
docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

容器部署时连接字符串应类似：

```dotenv
MONGODB_URI=mongodb://mongodb:27017/daily-hot-api
```

应用会尽量在 MongoDB 暂时不可用时继续运行，因此“进程在线”不代表历史和简报功能可用。

## 热榜返回空数组

实时热榜可能以 `200` 返回空 `data` 和 `message`。请检查：

- 上游站点是否变更接口或页面结构。
- `REQUEST_TIMEOUT` 是否过短。
- 上游是否要求新的 Header、Cookie、签名或区域网络。
- 日志中对应 `Source` 的错误信息。
- 使用 `noCache=true` 重试；受保护来源会忽略强刷参数。

```bash
curl 'http://localhost:6688/hot-lists/zhihu?noCache=true'
```

## 定时任务没有运行

```bash
curl http://localhost:6688/api/scheduler/status
curl http://localhost:6688/api/briefs/scheduler/status
```

确认：

- `SCHEDULER_AUTO_START` 或 `BRIEF_ENABLED` 已启用。
- Cron 表达式有效。
- 简报的 `BRIEF_TIMEZONE` 正确。
- 修改 `.env` 后已经重启进程。
- 多实例部署中检查的是实际负责调度的实例。

## AI 简报生成失败

依次检查：

1. `OPENAI_API_KEY`、`OPENAI_API_BASE_URL` 和 `AI_MODEL`。
2. `TAVILY_API_KEY` 及外部网络。
3. `BRIEF_SOURCES` 中的来源是否能返回数据。
4. MongoDB 是否可写。
5. 最新失败简报的 `error` 字段；需要输入证据时才使用 `includeDebug=true`。

测试时减少成本和等待时间：

```bash
curl -X POST http://localhost:6688/api/briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"sources":["cls"],"period":"manual-test","force":true}'
```

## 文档站资源 404

GitHub Pages 项目站点部署在 `/daily-hot-api/` 子路径。确认 `docs/.vitepress/config.mts` 包含：

```ts
base: '/daily-hot-api/'
```

并在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**。
