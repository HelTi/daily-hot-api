# PM2 部署

PM2 适合在已有 Node.js、MongoDB 和 Redis 的服务器上运行单实例服务。

## 准备

```bash
npm ci
cp .env.example .env
npm run build
```

编辑 `.env`，确认生产端口、MongoDB、Redis、CORS 和任务开关。生产服务器不要保留示例 API Key。

::: warning MONGODB_URI 必填
`ecosystem.config.cjs` 设置了 `NODE_ENV=production`，此时 `MONGODB_URI` 为必填项。`.env` 里缺失（包括从旧版本升级、`.env` 早于该变量存在的情况）会导致进程在启动阶段反复崩溃，PM2 重试到上限后把状态置为 `errored`：

```text
ERROR [ExceptionHandler] Error: 配置验证失败: Error: MONGODB_URI is required when NODE_ENV=production. ...
```

`deploy-pm2.sh` 会在调用 PM2 之前检查这一项并直接报错退出。手动 `pm2 start` 时请先确认：

```bash
grep -E '^MONGODB_URI=.+' .env || echo '缺少 MONGODB_URI'
```
:::

服务端口取自 `.env` 的 `PORT`（默认 `6689`），`ecosystem.config.cjs` 不再覆盖它，因此改端口只需改 `.env` 并重启。

## 使用项目脚本

仓库提供 `deploy-pm2.sh`：

```bash
sh deploy-pm2.sh
```

也可以直接使用 `ecosystem.config.cjs`：

```bash
npx pm2 start ecosystem.config.cjs
npx pm2 status
npx pm2 logs daily-hot-api
```

当前 PM2 配置以单实例运行。AI 简报和热点抓取使用进程内调度状态，除非另行实现分布式锁，否则不要把启用了调度器的应用直接扩展为多个 PM2 实例。

## 更新服务

```bash
git pull
npm ci
npm run build
npx pm2 restart daily-hot-api --update-env
```

重启后检查：

```bash
curl http://localhost:6689/health
curl http://localhost:6689/api/scheduler/status
curl http://localhost:6689/api/briefs/scheduler/status
```

## 开机启动

根据 PM2 输出配置当前系统的启动服务：

```bash
npx pm2 startup
npx pm2 save
```

`pm2 startup` 会输出一条需要按服务器环境执行的命令，请审阅后再运行。
