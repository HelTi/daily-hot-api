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
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

`briefDate + period` 是唯一组合。默认前端响应会移除 `rawInputItems` 和 `searchEvidence`；仅在请求带有 `includeDebug=true` 时返回。
