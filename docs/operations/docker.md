# Docker 部署

仓库提供 `Dockerfile`、`docker-compose.yml` 和 `Makefile`。Docker Compose 会启动应用、MongoDB 与 Redis，并使用命名卷保存数据库数据。

## Docker Compose

构建并启动：

```bash
docker compose up -d --build
```

也可以使用 Makefile：

```bash
make deploy
```

默认服务：

| 服务 | 地址 |
| --- | --- |
| API | `http://localhost:6689` |
| MongoDB | `localhost:27017` |
| Redis | `localhost:6380` |

检查状态：

```bash
docker compose ps
curl http://localhost:6689/health
```

查看日志：

```bash
docker compose logs -f app
```

停止容器但保留数据卷：

```bash
docker compose down
```

::: danger 数据卷
不要在未备份时执行 `docker compose down -v`，该命令会删除 Compose 管理的 MongoDB 和 Redis 数据卷。
:::

## Compose 配置

应用容器默认使用：

```dotenv
PORT=6689
MONGODB_URI=mongodb://mongodb:27017/daily-hot-api
REDIS_HOST=redis
REDIS_PORT=6379
SCHEDULER_AUTO_START=false
SCHEDULER_CRON_EXPRESSION=0 */12 * * *
```

如需开启热点自动抓取或 AI 每日简报，建议创建仅本机保存的 Compose override 或 `.env` 注入配置，不要把真实 API Key 写进 `docker-compose.yml`。

## 使用预构建镜像

```bash
docker pull ghcr.io/helti/daily-hot-api:latest

docker run -d \
  --name daily-hot-api \
  --restart unless-stopped \
  -p 6688:6688 \
  -e PORT=6688 \
  -e REDIS_HOST=host.docker.internal \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/daily-hot-api \
  ghcr.io/helti/daily-hot-api:latest
```

在 Linux 上，容器访问宿主机服务时可能需要额外添加 `--add-host=host.docker.internal:host-gateway`。生产环境更推荐把应用、Redis 和 MongoDB 放入同一个 Docker 网络，并使用服务名互联。

## 更新

使用本地源码：

```bash
git pull
docker compose up -d --build
```

使用远程镜像：

```bash
docker compose pull
docker compose up -d
```

更新前先阅读变更说明，并为 MongoDB 数据创建备份。数据卷管理见[数据卷与备份](/operations/volumes)。
