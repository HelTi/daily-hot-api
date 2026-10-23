# 数据卷与备份

## 数据卷

Compose 使用 `mongodb_data:/data/db` 保存 MongoDB 数据，使用 `redis_data:/data` 保存 Redis 缓存。容器重建后卷仍存在；删除卷会删除其中的数据。可用 `docker compose config --volumes` 查看实际卷名。

应用镜像不包含 `mongodump`，服务内不运行数据库备份任务。`SCHEDULER_AUTO_START` 只控制热榜抓取。

## MongoDB 在线备份

在能访问 MongoDB 的运维主机安装 MongoDB Database Tools，并设置指向**目标数据库**的 `MONGODB_URI`。Compose 的 MongoDB 端口默认只发布到宿主机 `127.0.0.1:27017`。下面的 URI 是无密码本地示例；有认证时通过受保护的环境或密钥管理器提供连接串，不要提交到仓库。

```bash
MONGODB_URI='mongodb://127.0.0.1:27017/daily-hot-api' ./manage-volumes.sh backup
```

脚本先写入 `backup/mongodb_时间.archive.gz.partial`，`mongodump` 成功且文件非空后才改名为 `.archive.gz`。失败时旧备份不会被删除。它不自动删除历史备份；请在外部调度器中配置执行频率和保留周期，并将备份复制到独立存储。

### 恢复演练

先在**隔离测试库**恢复并检查集合数、关键文档数和索引，再把备份纳入生产恢复预案。不要将下面的测试 URI 指向生产库。

```bash
RESTORE_URI='mongodb://127.0.0.1:27017/daily-hot-api-restore-test'
mongorestore --uri "$RESTORE_URI" --archive=backup/mongodb_YYYYMMDD_HHMMSS.archive.gz --gzip
mongosh "$RESTORE_URI" --eval 'db.hotitems.countDocuments({})'
```

## Redis 与离线卷快照

Redis 在本项目主要承载缓存，通常无需为业务恢复而备份。运行中的 MongoDB 数据卷不能直接用 `tar` 得到一致性备份；如需卷级快照，先停止 MongoDB 写入并按数据库存储方案执行。`./manage-volumes.sh list|info|size` 可查看卷信息。`clean` 会删除 Docker 上所有未使用的卷，执行前请核对影响范围。
