// Run with mongosh. Dry-run by default; set HOT_ITEM_MIGRATION_APPLY=1 to mutate.
// Stop all hot-list and brief writers and take a verified backup before apply.
const collection = db.getCollection('hotitems');
const apply = process.env.HOT_ITEM_MIGRATION_APPLY === '1';
const duplicates = collection.aggregate(
  [
    { $group: { _id: { source: '$source', url: '$url' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ],
  { allowDiskUse: true },
);

let groups = 0;
let redundantDocuments = 0;
for (const group of duplicates) {
  groups += 1;
  redundantDocuments += group.count - 1;
  if (!apply) continue;

  const documents = collection
    .find(group._id, { _id: 1 })
    .sort({ timestamp: -1, createdAt: -1, _id: -1 })
    .toArray();
  const removeIds = documents.slice(1).map((item) => item._id);
  if (removeIds.length) collection.deleteMany({ _id: { $in: removeIds } });
}

printjson({ mode: apply ? 'apply' : 'dry-run', groups, redundantDocuments });
if (!apply) {
  print('No changes made. Pause writers and verify a backup before apply.');
} else {
  const index = collection.getIndexes().find((item) => item.name === 'source_1_url_1');
  if (index && !index.unique) collection.dropIndex(index.name);
  collection.createIndex({ source: 1, url: 1 }, { unique: true, name: 'source_1_url_1' });
  print('Unique index is ready.');
}
