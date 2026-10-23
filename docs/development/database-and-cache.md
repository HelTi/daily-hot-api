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
热点存储使用 `{source, url}` 唯一索引与 `bulkWrite` 幂等写入。现有数据库必须先执行[唯一索引迁移](/operations/hot-item-index-migration)，再部署依赖该约束的写入逻辑。
:::

### 历史条目是首次抓取的快照

`saveHotItems` 的写入只用 `$setOnInsert`，因此同一 `{source, url}` 的记录**只在首次抓取时写入，之后不再改动**：

- `hot` 保持首次抓取时的热度，不随后续抓取刷新，因此 `hot_items` 不能用来做热度趋势。
- `timestamp` 取上游时间戳，上游没有提供时取首次入库时刻，之后固定不变。这是回看窗口能正常工作的前提：若每次抓取都刷新该字段，上游不带时间戳的来源会让旧条目不断重新落入 `BRIEF_LOOKBACK_HOURS` 窗口和 `/api/history` 的时间范围查询。
- `title`、`desc`、`cover` 等同样保持首次抓取时的内容，上游后来的编辑不会反映到历史记录里。
- `savedCount`（调度任务结果与 `GET /api/scheduler/runs/:runId`）统计的是**新插入条数**，不是本次处理条数；重复抓取同一批数据时它会是 0。

简报的实时条目直接来自本次抓取结果，并且在合并时优先于历史条目（去重键为 `source + url`），所以仍在榜上的条目用的是新鲜热度；陈旧的 `hot` 只影响已经掉榜但仍在回看窗口内的条目。

如果后续需要热度趋势或"在榜时长"，应新增 `lastSeenAt` 字段并只对 `hot` 追加 `$set`，而不是把整条记录改成每次抓取都覆盖。

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

## 上游请求缓存键

`HttpClientService` 把每次上游请求的缓存键算成 `http:<sha256>`，参与计算的是请求方法、不含查询串的地址、稳定查询、请求头、请求体和 `responseType`。URL 自带的查询串会和 `params` 合并后排序，因此参数顺序和写在 URL 还是 `params` 里都不影响命中。

以下字段**不参与**缓存身份，因为它们每次请求都变，算进键会让缓存永不命中并按请求数堆积 Redis 键：

- 查询参数和请求体顶层字段：`_`、`_t`、`_signature`、`msToken`、`nonce`、`sign`、`signature`、`timestamp`、`token`、`w_rid`、`wts`（大小写不敏感）。
- 请求头：`Cookie`、`User-Agent`、`X-UDID`。本项目的 Cookie 和 UA 只用于绕过反爬，不决定响应内容，UA 缺省时还会由 `HttpClientService` 随机生成。

新增来源时，如果上游要求的防缓存戳或签名字段不在上面的列表里，需要把字段名加进 `src/http/http.service.ts` 的 `VOLATILE_REQUEST_KEYS` / `VOLATILE_HEADER_KEYS`，否则该来源不会命中缓存。反过来，真正用于选择内容的参数（如 `page`、`month`、`area`）必须留在键里。

验证某个来源是否命中缓存：

```bash
curl -s 'http://localhost:6689/hot-lists/zhihu' | grep -o '"fromCache":[a-z]*'
curl -s 'http://localhost:6689/hot-lists/zhihu' | grep -o '"fromCache":[a-z]*'
redis-cli --scan --pattern 'http:*' | wc -l
```

第二次请求应返回 `"fromCache":true`，并且键数量不随请求次数增长。

## 本地检查

```bash
curl http://localhost:6689/health
curl http://localhost:6689/ready
curl http://localhost:6689/api/history/stats
```

Docker 环境下可以进入数据库检查集合：

```bash
docker compose exec mongodb mongosh daily-hot-api
```

```javascript
show collections
db.hotitems.find().limit(5)
db.dailybriefs.find().sort({ createdAt: -1 }).limit(1)
```

数据备份与恢复见[数据卷与备份](/operations/volumes)。
