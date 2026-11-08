# 数据结构

## 实时热榜响应

```ts
interface HotListResponse {
  code: number;
  name: string;
  title: string;
  type: string;
  description?: string;
  link?: string;
  total: number;
  data: HotListItem[];
  fromCache?: boolean;
  updateTime?: string;
  message?: string;
  params?: Record<string, unknown>;
}

interface HotListItem {
  id: string | number;
  title: string;
  desc?: string;
  cover?: string;
  author?: string;
  hot?: number | string;
  timestamp?: number;
  url: string;
  mobileUrl: string;
}
```

`message` 通常仅在上游抓取失败时出现。`params` 用于描述某个来源支持的 `type`、`range` 等动态选项。

## 历史热点分页

```ts
interface HistoryResponse {
  data: HotItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

MongoDB 中的历史热点字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `source` | string | 来源 ID |
| `title` | string | 标题 |
| `desc` | string | 可选摘要 |
| `cover` | string | 可选封面 URL |
| `author` | string | 可选作者 |
| `hot` | number/string | 热度值 |
| `url` | string | 原始链接 |
| `mobileUrl` | string | 移动端链接 |
| `timestamp` | number | 内容时间戳，毫秒 |
| `createdAt` | Date | 入库时间 |
| `updatedAt` | Date | 更新时间 |

查询索引覆盖来源、URL、时间戳以及标题/描述全文搜索。

## 数据源配置

```ts
interface SourceConfig {
  source: string;
  enabled: boolean;
  interval: number;
  lastFetchAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
```

`interval` 的单位为分钟，默认值为 30。

## 每日简报

```ts
interface DailyBrief {
  briefDate: string;
  period: string;
  status: 'generating' | 'success' | 'failed';
  sources: string[];
  inputWindow: {
    start: Date;
    end: Date;
    lookbackHours: number;
  };
  analysis?: Record<string, unknown>;
  markdown?: string;
  rawInputItems: Record<string, unknown>[];
  searchEvidence: Record<string, unknown>[];
  model?: string;
  tavilyUsed: boolean;
  searchProvidersUsed: string[];
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

`briefDate + period` 是唯一组合。`searchProvidersUsed` 记录实际提供搜索证据的平台；`tavilyUsed` 保留兼容，仅在 Tavily 提供证据时为 `true`。旧简报可能没有 `searchProvidersUsed`。默认前端响应会移除 `rawInputItems` 和 `searchEvidence`；仅在请求带有 `includeDebug=true` 时返回。

## 通用新闻简报

每份板块简报保存在 MongoDB 的 `newsbriefs` collection 中，组合键为 `briefDate + period + category`：

```ts
interface NewsBrief {
  briefDate: string;        // YYYY-MM-DD
  period: string;           // 默认 daily
  category: string;         // finance | general | tech | sports
  categoryName: string;     // 板块展示名快照，如「科技」
  status: 'generating' | 'success' | 'failed';
  title?: string;
  summary?: string;
  highlights: string[];
  items: NewsBriefItem[];
  sources: string[];
  inputWindow: {
    start: Date;
    end: Date;
    lookbackHours: number;
  };
  rawInputItems: Record<string, unknown>[];   // 调试字段，默认隐藏
  searchEvidence: Record<string, unknown>[];  // 搜索证据调试字段，默认隐藏；未开启搜索增强时为空
  model?: string;
  searchProvidersUsed: string[];
  error?: string;
  generationId?: string;
  generationHeartbeatAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface NewsBriefItem {
  id: string;             // sha256(category|sourceRef) 前 12 位
  title: string;          // 新闻标题，最多 80 字
  summary: string;        // 新闻简介，最多 160 字
  content: string;        // 新闻内容，默认最多 300 字；开启搜索增强后最多 600 字
  source: {
    code: string;         // 热榜来源 code，如 cls / 36kr
    name: string;         // 来源展示名，如「财联社」
    url: string;          // 原文链接，由服务端从候选条目回填
  };
  publishedAt?: string;   // ISO 8601；候选条目没有时间戳时不返回该字段
  tags?: string[];        // 最多 5 个，单个 ≤12 字
  importance?: number;    // 0–100，用于排序和前端标红
  extensions?: Record<string, unknown>; // 板块扩展位；当前没有任何板块写入
}
```

说明：

- `briefDate + period + category` 是唯一组合，用于生成幂等和并发 claim。
- 默认 API 响应隐藏 `rawInputItems`、`searchEvidence`、`generationId`、`generationHeartbeatAt`；`includeDebug=true` 时返回前两个调试字段。
- `status` 为 `generating` / `failed` 时 `highlights` 和 `items` 仍是数组（可能为空），前端不需要额外判空。
- `category` 取自代码内板块注册表，当前内置 `finance`、`general`、`tech`、`sports`；`categoryName` 是生成时的展示名快照，板块改名不会影响历史数据。
- 字段使用 camelCase；时间为 ISO 字符串，日期为 `YYYY-MM-DD`；可选字段缺省时不返回。
- 开启搜索增强（`NEWS_BRIEF_SEARCH_ENABLED=true`）后，`searchEvidence` 保存检索证据，`searchProvidersUsed` 记录实际命中的平台，`content` 目标长度放宽到 600 字。

### 多板块聚合（digest）

`GET /api/news-briefs/digest` 一次返回多个板块在同一天的简报：

```ts
interface NewsBriefDigestResponse {
  briefDate: string;   // YYYY-MM-DD
  categories: Array<{
    category: string;
    categoryName: string;
    status: 'success' | 'generating' | 'failed' | 'missing';
    brief: NewsBriefResponse | null;
  }>;
}
```

`NewsBriefResponse` 的各字段含义见[通用新闻简报](/guide/news-brief)的「前端响应字段」。

- `status` 是读取层状态：`missing` 表示该日期该板块没有记录，只出现在 digest 响应里；数据库里的状态仍然只有 `generating` / `success` / `failed`。
- `status=missing` 时 `brief` 为 `null`；其他状态返回该板块简报（与 `GET /api/news-briefs/:date` 的公开字段一致）。
- `categories` 省略时返回全部启用板块；顺序与请求顺序或 `NEWS_BRIEF_CATEGORIES` 一致。

### 分页列表

`GET /api/news-briefs` 返回简报摘要列表，不返回 `items`：

```ts
interface NewsBriefListItem {
  briefDate: string;
  period: string;
  category: string;
  categoryName: string;
  status: 'generating' | 'success' | 'failed';
  title?: string;
  summary?: string;
  itemCount: number;
  updatedAt?: string;   // ISO 8601
}

interface NewsBriefListResponse {
  data: NewsBriefListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

需要条目内容时，再用 `GET /api/news-briefs/:date?category=` 查询单份简报。`updatedAt` 在 MongoDB 中是 `Date`，接口响应里序列化为 ISO 字符串。

### 删除响应

两个 DELETE 路由都返回删除条数：

```ts
interface NewsBriefDeleteResponse {
  mode: 'date';
  briefDate: string;
  category: string;
  period: string | null;
  deletedCount: number;
}

interface NewsBriefDeleteHistoryResponse {
  mode: 'olderThan' | 'beforeDate';
  olderThan: string | null;
  beforeDate: string;
  category: string | null;
  deletedCount: number;
}
```

`deletedCount: 0` 表示没有匹配记录。删除是不可恢复的破坏性操作，执行前建议先用 `1900-01-01` / `beforeDate=1900-01-01` 做安全 no-op 检查。
