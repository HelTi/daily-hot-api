# Docker 快速启动

## 一键启动

```bash
# 启动所有服务（应用 + MongoDB + Redis）
./start-with-mongodb.sh

# 或者直接使用 docker-compose
docker-compose up -d
```

## 服务说明

- **应用**: http://localhost:6689
- **MongoDB**: localhost:27017 (无密码)
- **Redis**: localhost:6380

## 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

## 环境变量

Docker Compose 会自动配置以下环境变量：

- `MONGODB_URI=mongodb://mongodb:27017/daily-hot-api`
- `REDIS_HOST=redis`
- `REDIS_PORT=6379`
- `SCHEDULER_AUTO_START=true`
- `SCHEDULER_CRON_EXPRESSION=0 */12 * * *`

## 数据持久化

- MongoDB 数据保存在 `mongodb_data` 卷中
- Redis 数据保存在 `redis_data` 卷中

## 连接数据库

```bash
# 连接 MongoDB
docker-compose exec mongodb mongosh daily-hot-api

# 查看数据
show collections
db.hot_items.find().limit(5)
```
