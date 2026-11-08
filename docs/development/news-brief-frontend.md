# 通用新闻简报前端接入

本文档说明前端如何接入通用新闻简报（`/api/news-briefs`），基于 P1 的聚合、分页与详情接口设计。
后端地址示例：`http://localhost:6689`

## 前端职责

- 首页用 `digest` 一次拿到多个板块同一天的简报。
- 板块切换、日期切换、历史列表分别使用 `latest`、`:date` 和分页列表接口。
- 前端**只调用只读 `GET` 接口**：不调用 `POST /generate`，不请求 `includeDebug=true`，不提供删除入口。
- 删除接口存在，但没有鉴权且不可恢复，只能在后台/运维脚本中使用。

## 可用接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/news-briefs/config` | 读取搜索增强开关、板块列表和调度状态 |
| `GET` | `/api/news-briefs/categories` | 板块筛选项 |
| `GET` | `/api/news-briefs/digest` | 首页多板块聚合 |
| `GET` | `/api/news-briefs/latest` | 指定板块最新成功简报 |
| `GET` | `/api/news-briefs/:date` | 指定日期、指定板块详情 |
| `GET` | `/api/news-briefs` | 历史简报分页列表 |

写入类接口（`POST /api/news-briefs/generate`、`DELETE`、`scheduler/*`）不属于前端调用范围。

## 首页聚合：digest

```bash
curl 'http://localhost:6689/api/news-briefs/digest?categories=finance,tech&date=2026-11-08&period=daily'
```

响应：

```json
{
  "briefDate": "2026-11-08",
  "categories": [
    {
      "category": "finance",
      "categoryName": "财经",
      "status": "success",
      "brief": {
        "briefDate": "2026-11-08",
        "period": "daily",
        "category": "finance",
        "categoryName": "财经",
        "status": "success",
        "title": "财经每日简报",
        "summary": "……",
        "highlights": ["……"],
        "items": [],
        "itemCount": 8,
        "sources": ["cls", "yicai"],
        "inputWindow": {
          "start": "2026-11-07T06:30:00.000Z",
          "end": "2026-11-08T06:30:00.000Z",
          "lookbackHours": 24
        },
        "searchProvidersUsed": []
      }
    },
    {
      "category": "tech",
      "categoryName": "科技",
      "status": "missing",
      "brief": null
    }
  ]
}
```

使用规则：

- `categories` 省略时返回全部启用板块；未知或未启用的板块 code 返回 400。
- `date` 缺省为今天（按简报时区），`period` 缺省为 `daily`。
- `categories[].status` 是**读取层状态**，取值 `success` / `generating` / `failed` / `missing`。`missing` 表示该日期该板块还没有记录（数据库状态仍只有前三种），此时 `brief` 为 `null`。
- 首页可以直接按 `categories[]` 的顺序渲染板块区块：`status=success` 渲染内容，`generating` 显示生成中，`failed` 显示失败提示，`missing` 显示「该板块暂无简报」。
- 一次 `digest` 请求即可完成首页首屏，不需要按板块并发请求 `latest`。

## 板块目录

```bash
curl http://localhost:6689/api/news-briefs/categories
```

返回启用板块数组（`code`、`name`、`description`、`sources`、`maxItems`），用于顶部板块切换和颜色映射。`code` 是稳定的机器标识，`name` 是展示名。

## 最新简报与日期详情

指定板块的最新成功简报：

```bash
curl 'http://localhost:6689/api/news-briefs/latest?category=tech'
```

`category` 必填，省略或传入未注册板块返回 400；只返回 `status=success` 的最近一份，没有数据时返回 200 空响应体。

指定日期（可能返回生成中或失败状态）：

```bash
curl 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech'
```

- `period` 缺省 `daily`；`date` 必须是 `YYYY-MM-DD`。
- 记录不存在时返回 200 空响应体；`status=generating` / `failed` 时展示对应状态，`failed` 时 `error` 字段可见（普通用户只展示通用提示）。
- 不要携带 `includeDebug=true`；`rawInputItems` 和 `searchEvidence` 是后端排查字段。

## 历史列表分页

```bash
curl 'http://localhost:6689/api/news-briefs?page=1&limit=20&category=tech&period=daily'
```

参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | number | `1` | 页码，最小为 1 |
| `limit` | number | `20` | 每页条数，范围 1–100 |
| `category` | string | 全部 | 只看某个板块，需为已注册板块 code |
| `status` | string | 全部 | `success` / `generating` / `failed` |
| `period` | string | `daily` | 简报类型 |

响应：

```json
{
  "data": [
    {
      "briefDate": "2026-11-08",
      "period": "daily",
      "category": "tech",
      "categoryName": "科技",
      "status": "success",
      "title": "科技每日简报",
      "summary": "今日科技板块……",
      "itemCount": 8,
      "updatedAt": "2026-11-08T00:41:00.000Z"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

- 列表只返回摘要：`items`、`highlights` 和调试字段不在列表里返回。点击某一条后，用 `GET /api/news-briefs/:date?category=` 拉取详情。
- `title`、`summary`、`updatedAt` 是可选字段，缺省时不返回。
- 列表按 `briefDate` 倒序排列。

## 搜索增强（默认关闭）

搜索增强由服务端配置控制，默认关闭。前端可读取 `GET /api/news-briefs/config` 里的字段判断是否开启：

```json
{
  "searchEnabled": false,
  "searchProviders": ["tavily", "deepseek"],
  "searchMaxQueries": 6,
  "searchQueryMaxChars": 2000
}
```

`searchProviders` 是配置的平台优先级，不代表平台密钥一定已配置；`searchEnabled` 为 `true` 但平台未配置密钥时服务端会跳过搜索。

开启后：

- 详情响应的 `searchProvidersUsed` 会返回实际命中证据的搜索平台（如 `["tavily"]`）；为空数组表示这次简报没有搜索证据。
- 单条新闻的 `content` 目标长度会从 300 字放宽到 600 字；前端布局要能容纳更长的正文。
- 搜索增强会产生额外调用费用，前端不要提供开关入口，也不要假设它一定开启。

## 响应字段约定

- 字段使用 camelCase；日期为 `YYYY-MM-DD`，时间为 ISO 8601 字符串（如 `2026-11-08T00:41:00.000Z`）。
- 可选字段缺省时**不返回**，前端按可选处理，不要依赖 `null`。
- `highlights`、`items`、`sources`、`searchProvidersUsed` 始终是数组；`status=generating` / `failed` 时可能是空数组。
- `itemCount` 等于 `items.length`，为 0 时也会返回。
- 单份简报不存在时返回 **200 空响应体**，不是 404；请求失败时解析响应体前先判断 `response.ok` 和响应文本是否为空。
- `digest` 中不存在的板块用 `status=missing` + `brief: null` 表达，不要把它当作数据库状态。

## 状态处理

| 状态 | 含义 | 展示建议 |
| --- | --- | --- |
| `success` | 生成成功 | 正常渲染标题、摘要、要点和条目 |
| `generating` | 正在生成 | 显示「生成中」，可每 10–15 秒轮询一次当前日期详情 |
| `failed` | 生成失败 | 普通用户显示通用失败提示；管理端可展示 `error` |
| `missing` | 仅 digest 读取层：该日期无记录 | 显示「暂无简报」，不要显示为错误 |

`latest` 只返回成功记录；需要展示生成中/失败状态时用 `:date` 或列表接口。

重试一条 `failed` 记录时，服务端会在抢到生成占位的同时把它改回 `generating` 并清掉上一次的 `error`，所以轮询期间不会看到「正在重试却一直报 failed」。`force` 重新生成一条已有的 `success` 记录是例外：它在整个重生成过程中保持 `success` 并继续返回旧内容，失败也不会把旧内容覆盖掉。

## 推荐页面结构

```text
┌────────────────────────────────────────────────────────────┐
│ 顶部栏：通用新闻简报 | 日期选择 | 板块切换 | 刷新           │
├────────────────────────────────────────────────────────────┤
│ 首页区块：digest 返回的每个板块                             │
│  ├─ 板块标题 / categoryName                                 │
│  ├─ 简报摘要 summary、要点 highlights                       │
│  ├─ 新闻条目列表 items[]（标题 / 简介 / 内容 / 来源）        │
│  └─ 更多入口 -> 该板块日期详情                              │
├────────────────────────────────────────────────────────────┤
│ 历史列表：分页 + 板块/状态筛选（列表项跳详情）               │
└────────────────────────────────────────────────────────────┘
```

## 字段映射

| UI 区块 | 字段 |
| --- | --- |
| 板块切换 | `categories[].code`、`categories[].name` |
| 板块状态徽标 | `status`（digest 读取层状态） |
| 简报标题 | `brief.title` |
| 简报摘要 | `brief.summary` |
| 今日要点 | `brief.highlights` |
| 新闻条目 | `brief.items[]`：`title` / `summary` / `content` / `source` |
| 来源展示 | `item.source.name`；`item.source.url` 作为原文跳转 |
| 发布时间 | `item.publishedAt`（可能缺省） |
| 标签 / 重要度 | `item.tags` / `item.importance` |
| 数据窗口 | `brief.inputWindow.start` / `brief.inputWindow.end` |
| 搜索增强 | `brief.searchProvidersUsed`；`/config` 的 `searchEnabled` |
| 历史列表项 | `briefDate`、`status`、`title` / `summary`、`itemCount`、`updatedAt` |

## 请求示例

首页聚合：

```ts
async function fetchDigest(categories, date, period = 'daily') {
  const params = new URLSearchParams();
  if (categories?.length) params.set('categories', categories.join(','));
  if (date) params.set('date', date);
  params.set('period', period);

  const response = await fetch(`/api/news-briefs/digest?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch news brief digest');
  }
  return response.json();
}
```

日期详情（兼容 200 空响应体）：

```ts
async function fetchNewsBriefByDate(date, category, period = 'daily') {
  const params = new URLSearchParams({ category, period });
  const response = await fetch(`/api/news-briefs/${date}?${params}`);

  if (!response.ok) {
    throw new Error('Failed to fetch news brief');
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
```

历史列表：

```ts
async function fetchNewsBriefPage({ page = 1, limit = 20, category, status, period = 'daily' }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), period });
  if (category) params.set('category', category);
  if (status) params.set('status', status);

  const response = await fetch(`/api/news-briefs?${params}`);
  return response.json();
}
```

## 删除接口（仅后台）

两个删除接口**仅供后台管理和运维脚本使用**，普通前端页面不要提供入口：

```bash
# 安全 no-op 检查：期望 deletedCount: 0
curl -X DELETE 'http://localhost:6689/api/news-briefs/1900-01-01?category=tech&period=manual-test'
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?beforeDate=1900-01-01'

# 确认范围后再执行
curl -X DELETE 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech'
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?olderThan=1y&category=tech'
```

- `DELETE /api/news-briefs/:date` 的 `category` 必填，避免误删全部板块。
- `DELETE /api/news-briefs/history` 的 `olderThan` 与 `beforeDate` 二选一；`category` 可选。
- 两个接口都没有内建鉴权，删除后无法恢复，必须在网关层限制来源。
- 响应字段见[数据结构](/reference/data-structures)。

## 注意事项

1. 不要请求 `includeDebug=true`，调试字段体积大且不适合展示。
2. 不要在前端调用 `POST /api/news-briefs/generate`；生成由定时任务负责。
3. `digest` 的 `missing` 是读取层状态，不是数据库状态。
4. 内容基于热榜标题和摘要整理，不抓取网页正文；展示时可保留「内容由 AI 整理」的说明。
5. 板块之间数据源可能重叠，同一事件可能同时出现在多个板块。
6. 财经板块不做股票关联和产业链分析；需要 A 股分析时使用 AI 每日简报页面。
7. 搜索增强默认关闭，`searchProvidersUsed` 可能为空数组。
