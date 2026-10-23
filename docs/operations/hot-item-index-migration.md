# 热榜唯一索引迁移

`HotItem` 没有显式指定集合名，Mongoose 当前使用 **`hotitems`**，不是旧文档中的 `hot_items`。新代码依靠 `{ source: 1, url: 1 }` 唯一索引避免并发重复入库。现有库必须先检查重复数据，再部署含唯一索引的新版本。

## 迁移顺序

1. 在目标数据库确认集合名和索引：`db.getCollectionNames()`、`db.hotitems.getIndexes()`。验证 `MONGODB_URI` 指向目标环境。
2. 用宿主机上的 MongoDB Database Tools 备份 `hotitems`，并在隔离数据库做一次恢复验证。例如：`mongodump --uri "$MONGODB_URI" --collection=hotitems --archive=hotitems.archive.gz --gzip`。备份方式见[数据卷与备份](/operations/volumes)。
3. 暂停热点与简报调度，阻断手动抓取和生成入口，等待在途任务结束；最稳妥的做法是停止应用实例。迁移期间所有写入者都必须停下。
4. 先只读检查：`mongosh "$MONGODB_URI" --file scripts/hot-item-unique-index.js`。核对输出的重复组数与冗余文档数。
5. 确认备份后执行：`HOT_ITEM_MIGRATION_APPLY=1 mongosh "$MONGODB_URI" --file scripts/hot-item-unique-index.js`。脚本按 `timestamp`、`createdAt`、`_id` 降序保留每组一条，删除其余记录，并将旧的非唯一同名索引替换为唯一索引。
6. 再次检查 `db.hotitems.getIndexes()` 中 `source_1_url_1` 的 `unique: true`，然后部署新应用并恢复入口。用同一来源和 URL 连续抓取两次，确认只增加一条历史记录。

脚本默认是只读模式；本仓库不会自动对线上数据执行第 5 步。若建索引失败，保持写入暂停，检查是否仍有重复或缺少 `source/url` 的记录。若需恢复数据，先停止所有写入者，再从已验证的备份恢复；不要直接在正在写入的集合上覆盖恢复。
