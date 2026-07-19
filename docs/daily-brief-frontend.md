# 每日简报前端展示设计

本文档说明前端如何展示每日简报页面，基于后端 `/api/briefs` 系列接口和当前简报字段设计。
后端地址为：http://localhost:6688/

## 页面目标

每日简报页面不应只是新闻列表，而应帮助用户快速完成三件事：

1. 看清今天最重要的产业和市场变化。
2. 理解热点背后的产业链影响。
3. 找到 A 股相关线索、风险和后续跟踪信号。

推荐页面气质：信息密度适中、偏研究终端风格，少做营销式大卡片，多做可扫描、可展开、可追踪的内容区块。

## 数据来源

### 最新简报

```bash
GET /api/briefs/latest
```

不传 `period` 时返回最新成功简报。

### 正式日报

```bash
GET /api/briefs/latest?period=daily
```

### 指定日期

```bash
GET /api/briefs/2026-07-05?period=daily
```

### 历史列表

```bash
GET /api/briefs?page=1&limit=20&period=daily
```

### 历史股票排名

```bash
GET /api/briefs/statistics/stocks?period=daily&limit=20
```

接口返回历史成功简报中 A 股映射的出现次数排名。前端可使用：

服务端按完整查询条件缓存该接口，默认有效期为 12 小时；简报数据发生写入或删除时会自动失效缓存，前端无需额外处理。

- `rank`：名次
- `company` / `code`：股票展示信息
- `appearanceCount`：在主题映射中的累计出现次数
- `briefCount`：覆盖的不同简报数量
- `firstAppearedDate` / `lastAppearedDate`：首次和最近出现日期

建议同时展示 `appearanceCount` 和 `briefCount`，避免把同一份简报内的多主题重复出现误解为跨日持续热度。日期筛选可通过 `startDate` 和 `endDate` 传递，格式均为 `YYYY-MM-DD`。

前端默认不要使用 `includeDebug=true`。`rawInputItems` 和 `searchEvidence` 是后端排查字段，不适合常规展示。

## 核心字段

前端主要使用这些字段：

```ts
interface DailyBriefView {
  briefDate: string;
  period: string;
  status: 'generating' | 'success' | 'failed';
  sources: string[];
  inputWindow: {
    start: string;
    end: string;
    lookbackHours: number;
  };
  analysis?: {
    summary: string;
    highlights: string[];
    topics: BriefTopic[];
    risks: string[];
    followUpSignals: string[];
    markdown: string;
  };
  markdown?: string;
  model?: string;
  tavilyUsed: boolean;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

主题字段：

```ts
interface BriefTopic {
  title: string;
  event: string;
  importance: string;
  impactDirection: '利好' | '利空' | '中性' | '待验证';
  impactHorizon: '短期' | '中期' | '长期';
  confidence: number;
  industryChain: {
    upstream: string[];
    midstream: string[];
    downstream: string[];
    bottlenecks: string[];
  };
  aShareMapping: Array<{
    company: string;
    code?: string;
    logic: string;
    relationType: '直接受益' | '间接受益' | '题材映射' | '承压' | '待验证';
  }>;
  risks: string[];
  followUpSignals: string[];
  sourceUrls: string[];
}
```

## 推荐页面结构

```text
┌────────────────────────────────────────────────────────────┐
│ 顶部栏：每日简报 | 日期选择 | period 选择 | 刷新             │
├────────────────────────────────────────────────────────────┤
│ 概览区：日期、更新时间、数据源、模型、Tavily 状态             │
├────────────────────────────────────────────────────────────┤
│ 核心结论 summary                                            │
├────────────────────────────────────────────────────────────┤
│ 今日要点 highlights                                         │
├────────────────────────────────────────────────────────────┤
│ 重点主题 topics                                             │
│  ├─ 主题卡片 1：事件、影响方向、周期、置信度                  │
│  │   ├─ 产业链：上游 / 中游 / 下游 / 瓶颈                    │
│  │   ├─ A股关联：公司、代码、关系、逻辑                      │
│  │   ├─ 风险                                                │
│  │   └─ 跟踪信号 / 来源链接                                  │
│  └─ 主题卡片 N                                             │
├────────────────────────────────────────────────────────────┤
│ 全局风险 risks                                              │
├────────────────────────────────────────────────────────────┤
│ 后续跟踪 followUpSignals                                    │
└────────────────────────────────────────────────────────────┘
```

## 展示细节

### 顶部栏

建议展示：

- 页面标题：`每日简报`
- 日期选择器：按 `briefDate` 查询
- period 选择：默认 `daily`，可选 `manual-test` 或其他后端 period
- 刷新按钮：重新请求当前简报
- 历史入口：打开历史简报列表

不要把生成按钮直接暴露给普通用户，生成会调用模型和搜索接口，成本和耗时都比较高。后台或管理员页面可以提供手动生成。

### 概览区

字段映射：

| UI | 字段 |
| --- | --- |
| 简报日期 | `briefDate` |
| 更新时间 | `updatedAt` |
| 数据窗口 | `inputWindow.start` / `inputWindow.end` |
| 数据源 | `sources` |
| 模型 | `model` |
| 搜索增强 | `tavilyUsed` |

推荐展示成一行紧凑信息：

```text
2026-07-05 · 最近 24 小时 · 财联社/第一财经/华尔街见闻 · DeepSeek · 已搜索增强
```

### 核心结论

使用 `analysis.summary`。

这是页面第一视觉重点，建议用较大的正文块展示，但不要做夸张 hero。可以放在浅色提示区或顶部摘要区。

### 今日要点

使用 `analysis.highlights`。

推荐使用编号列表，最多展示 6-8 条。若超过 8 条，默认展示前 8 条，提供“展开全部”。

### 重点主题

使用 `analysis.topics`。

每个主题建议使用独立卡片，卡片内信息顺序：

1. 主题标题：`topic.title`
2. 标签区：
   - `impactDirection`
   - `impactHorizon`
   - `confidence`
3. 事件：`topic.event`
4. 重要性：`topic.importance`
5. 产业链拆解
6. A 股关联
7. 风险
8. 跟踪信号
9. 来源链接

### 影响标签

`impactDirection` 推荐视觉规则：

| 值 | 展示建议 |
| --- | --- |
| `利好` | 绿色标签 |
| `利空` | 红色标签 |
| `中性` | 灰色标签 |
| `待验证` | 黄色或描边标签 |

`impactHorizon` 推荐展示为：

```text
短期 / 中期 / 长期
```

`confidence` 推荐转换成百分比：

```ts
Math.round(confidence * 100) + '%'
```

不要过度强调置信度，放在标签区即可。

### 产业链展示

使用 `topic.industryChain`。

推荐四列或四个分组：

```text
上游：超导材料、磁体制造
中游：装置集成、等离子体控制
下游：发电运营、电网接入
瓶颈：长时间稳态运行、材料稳定性
```

桌面端可以四列展示，移动端改成纵向分组。

### A 股关联展示

使用 `topic.aShareMapping`。

推荐表格：

| 公司 | 代码 | 关系 | 关联逻辑 |
| --- | --- | --- | --- |
| 拓普集团 | 601689 | 直接受益 | 人形机器人执行器核心供应商 |

注意：

- `code` 可能为空或 `待验证`。
- `relationType=题材映射` 和 `待验证` 不应和 `直接受益` 使用同等强度的视觉。
- 前端应保留“非投资建议”提示。

### 风险和跟踪信号

主题内：

- `topic.risks`
- `topic.followUpSignals`

全局：

- `analysis.risks`
- `analysis.followUpSignals`

建议页面底部固定两个区块：

```text
风险提示
后续跟踪
```

主题卡内也保留局部风险和信号。这样用户既能看单个主题，也能看整份简报的总风险。

### 来源链接

使用 `topic.sourceUrls`。

建议展示为“来源 1 / 来源 2”，点击新窗口打开。不要把 URL 全量裸露在正文里。

## Markdown 展示

后端同时返回：

- `analysis.markdown`
- `markdown`

如果前端短期只想快速上线，可以直接渲染 `markdown`。但长期建议使用结构化字段自定义布局，因为结构化展示更适合：

- 标签筛选
- 卡片展开
- A 股表格
- 风险分区
- 移动端适配

推荐策略：

1. 第一版前端：优先结构化渲染。
2. 管理端或导出页：提供 Markdown 预览。
3. 如果 `analysis` 缺失，则降级展示 `markdown`。

## 状态处理

### 空状态

接口返回空时：

```text
暂无简报
今日简报还未生成，请稍后查看。
```

可以提供“查看历史简报”入口。

### 生成中

如果列表或详情返回 `status=generating`：

```text
简报生成中
正在抓取热点、搜索背景资料并生成分析。
```

可以每 10-15 秒轮询一次当前日期简报。

### 失败

如果 `status=failed`：

展示：

- `briefDate`
- `period`
- `error`
- 重试按钮，仅管理员可见

普通用户只看到：

```text
简报生成失败，请稍后再试。
```

## 历史简报列表

历史列表使用：

```bash
GET /api/briefs?page=1&limit=20&period=daily
```

列表项建议展示：

- 日期：`briefDate`
- 状态：`status`
- 重点摘要：`analysis.summary` 截断 80-120 字
- 主题数量：`analysis.topics.length`
- 更新时间：`updatedAt`

点击列表项进入指定日期详情：

```bash
GET /api/briefs/:date?period=daily
```

## 移动端适配

移动端推荐：

- 顶部日期选择收进工具栏
- 主题卡片单列展示
- A 股关联表格改为小卡片列表
- 产业链四列改为纵向折叠
- 来源链接放到卡片底部

避免在移动端展示过宽表格。

## 前端组件建议

可以拆成以下组件：

```text
BriefPage
BriefToolbar
BriefMetaBar
BriefSummary
BriefHighlights
BriefTopicCard
IndustryChainView
AShareMappingTable
RiskList
FollowSignalList
SourceLinks
BriefHistoryDrawer
BriefEmptyState
BriefErrorState
```

## 推荐字段映射

| 组件 | 字段 |
| --- | --- |
| `BriefToolbar` | `briefDate`, `period` |
| `BriefMetaBar` | `sources`, `inputWindow`, `model`, `tavilyUsed`, `updatedAt` |
| `BriefSummary` | `analysis.summary` |
| `BriefHighlights` | `analysis.highlights` |
| `BriefTopicCard` | `analysis.topics[]` |
| `IndustryChainView` | `topic.industryChain` |
| `AShareMappingTable` | `topic.aShareMapping` |
| `RiskList` | `topic.risks`, `analysis.risks` |
| `FollowSignalList` | `topic.followUpSignals`, `analysis.followUpSignals` |
| `SourceLinks` | `topic.sourceUrls` |

## 前端请求示例

```ts
async function fetchLatestBrief() {
  const response = await fetch('/api/briefs/latest?period=daily');
  if (!response.ok) {
    throw new Error('Failed to fetch daily brief');
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
```

按日期查询：

```ts
async function fetchBriefByDate(date: string, period = 'daily') {
  const response = await fetch(`/api/briefs/${date}?period=${period}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
```

历史列表：

```ts
async function fetchBriefHistory(page = 1, limit = 20) {
  const response = await fetch(
    `/api/briefs?page=${page}&limit=${limit}&period=daily`,
  );
  return response.json();
}
```

## 展示注意事项

1. 不要默认请求 `includeDebug=true`。
2. A 股关联只作为线索展示，需要明确风险提示。
3. `待验证` 内容要用弱化样式，不要和确定性结论混在一起。
4. `sourceUrls` 应作为用户核验入口。
5. 简报生成耗时较长，前端不要频繁触发生成接口。
6. 推荐在页面底部展示免责声明：

```text
本简报由 AI 基于公开热点与搜索材料生成，仅供信息参考，不构成投资建议。
```
