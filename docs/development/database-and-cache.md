# 数据库与缓存

## MongoDB

MongoDB 保存历史热点、来源调度配置和每日简报：

```dotenv
MONGODB_URI=mongodb://localhost:27017/daily-hot-api
```

目录约定：

```text
src/database/
├── schemas/        # Mongoose Schema
└── repositories/   # 数据访问封装
```

新增持久化模型时：

1. 使用 `@Schema()` 和 `SchemaFactory.createForClass()` 定义 Schema。
2. 在 `src/database/database.module.ts` 的 `MongooseModule.forFeature()` 中注册。
3. 创建 Repository 集中封装查询与写入。
4. 将 Repository 加入并导出 `DatabaseModule`。
5. 为唯一约束、列表排序和常用过滤条件设计索引。

当前关键索引：

- `HotItem`：`source + url`、`source + timestamp`、`timestamp`、标题/描述全文索引。
- `SourceConfig`：`source` 唯一索引。
- `DailyBrief`：`briefDate + period` 唯一索引、`createdAt` 倒序索引。

::: info 去重说明
热点存储使用 `source + url` 识别同来源内容。Schema 注释称其为去重索引；修改写入逻辑时仍应通过 Repository 的 upsert 行为验证实际去重结果。
:::

## Redis 与内存缓存

Redis 配置：

```dotenv
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
CACHE_TTL=3600
```

Redis 客户端使用 `lazyConnect`，启动阶段不强制握手。`CacheService` 还组合了 Nest 内存缓存，在 Redis 不可用时可为部分业务提供进程内降级。

需要注意：

- 进程内缓存不会在多个实例间共享。
- 进程重启会清空内存缓存。
- 不同业务可以使用不同 TTL，例如股票历史排名由 `BRIEF_STOCK_RANKING_CACHE_TTL` 控制。
- 写入或删除影响统计结果的数据后，应同步清理对应缓存。

## 本地检查

```bash
curl http://localhost:6688/health
curl http://localhost:6688/api/history/stats
```

Docker 环境下可以进入数据库检查集合：

```bash
docker compose exec mongodb mongosh daily-hot-api
```

```javascript
show collections
db.hot_items.find().limit(5)
db.dailybriefs.find().sort({ createdAt: -1 }).limit(1)
```

数据备份与恢复见[数据卷与备份](/operations/volumes)。
