# 热榜唯一索引迁移

`HotItem` 没有显式指定集合名，Mongoose 当前使用 **`hotitems`**，不是旧文档中的 `hot_items`。新代码依靠 `{ source: 1, url: 1 }` 唯一索引避免并发重复入库。现有库必须先检查重复数据，再部署含唯一索引的新版本。

旧库上已经存在同名的非唯一 `source_1_url_1` 索引，Mongoose 启动时建唯一索引会报 `An existing index has the same name as the requested index` 并放弃，集合仍然没有唯一约束。应用启动时会读一次实际索引状态，未就绪时输出告警：

```text
WARN [HotItemRepository] hotitems 的 {source,url} 不是唯一索引，并发抓取仍可能写入重复历史记录。请按 docs/operations/hot-item-index-migration.md 清理重复数据并重建 source_1_url_1 唯一索引。
```

看到这条告警说明去重只靠应用内的批次内去重，跨实例和跨批次的并发写入仍可能产生重复记录，需要执行下面的迁移。索引就绪时对应的日志是 `hotitems 的 {source,url} 唯一索引已就绪`。

## 迁移顺序

1. 在目标数据库确认集合名和索引：`db.getCollectionNames()`、`db.hotitems.getIndexes()`。验证 `MONGODB_URI` 指向目标环境。
2. 用宿主机上的 MongoDB Database Tools 备份 `hotitems`，并在隔离数据库做一次恢复验证。例如：`mongodump --uri "$MONGODB_URI" --collection=hotitems --archive=hotitems.archive.gz --gzip`。备份方式见[数据卷与备份](/operations/volumes)。
3. 暂停热点与简报调度，阻断手动抓取和生成入口，等待在途任务结束；最稳妥的做法是停止应用实例。迁移期间所有写入者都必须停下。
4. 先只读检查：`mongosh "$MONGODB_URI" --file scripts/hot-item-unique-index.js`。核对输出的重复组数与冗余文档数。
5. 确认备份后执行：`HOT_ITEM_MIGRATION_APPLY=1 mongosh "$MONGODB_URI" --file scripts/hot-item-unique-index.js`。脚本按 `timestamp`、`createdAt`、`_id` 降序保留每组一条，删除其余记录，并将旧的非唯一同名索引替换为唯一索引。
6. 再次检查 `db.hotitems.getIndexes()` 中 `source_1_url_1` 的 `unique: true`，然后部署新应用并恢复入口。确认启动日志里是 `唯一索引已就绪` 而不是告警，再用同一来源和 URL 连续抓取两次，确认只增加一条历史记录。

脚本默认是只读模式；本仓库不会自动对线上数据执行第 5 步。若建索引失败，保持写入暂停，检查是否仍有重复或缺少 `source/url` 的记录。若需恢复数据，先停止所有写入者，再从已验证的备份恢复；不要直接在正在写入的集合上覆盖恢复。
