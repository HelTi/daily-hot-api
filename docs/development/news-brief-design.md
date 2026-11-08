# 通用新闻简报（News Brief）设计文档

> 状态：设计稿 v0.4，**P0/P1 已实现**（2026-11-08）
> 日期：2026-11-08
> 关联功能：[AI 每日简报](/guide/daily-brief)（现有，保持不动）
> 适用模块：新增 `src/news-brief/`，新增接口前缀 `/api/news-briefs`

**修订记录**

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v0.1 | 2026-11-08 | 初稿：契约、板块 registry、流水线、持久化、API、配置、测试计划 |
| v0.2 | 2026-11-08 | 按独立评审整改：拆分 AI payload / 归一化模型类型；明确 force 失败保留旧 success；`latest` 默认 `period=daily`；`id` 改用 `sourceRef`；Prompt 不再下发真实 URL；补 P1 读/删契约；补全「零改动」清单（spec/README/枚举型文档）；明确输出条数与 `content` 长度优先级；修正容量估算与源启用语义 |
| v0.3 | 2026-11-08 | 按产品确认调整：新增体育板块、去掉汽车板块；财经板块不做股票关联；手动生成接口默认禁用（仅运维可临时开启，前端只用 GET）；P1 搜索词上限 2000 字 |
| v0.4 | 2026-11-08 | P1 实现完成：digest 聚合、分页列表、DELETE 清理、搜索增强（复用 daily-brief 搜索 client，只增 exports）、前端接入文档；补充搜索 query/证据长度说明 |

## 1. 背景与目标

### 1.1 现状与问题

现有「每日简报」（`src/daily-brief/`）是一条**财经专用**链路：

- 输入：`BRIEF_SOURCES` 中的财经热榜来源；
- 输出：`analysis.topics[]`，核心字段是产业链拆解（`industryChain`）和 A 股映射（`aShareMapping`）。

这套输出契约在非财经板块（综合新闻、科技、体育等）无法复用：一篇文章没有产业链和股票代码，前端也无法用同一个组件渲染。如果直接在现有 service/controller/schema 上加分支，会同时污染现有接口、数据库唯一索引和调度器，回归风险高。

### 1.2 目标

1. **新增一套通用新闻简报能力**，与现有每日简报并存，互不影响。
2. **统一内容模板**：所有板块返回同一种结构，核心为「新闻标题 / 新闻简介 / 新闻内容 / 新闻来源」，字段名、类型、长度约束在财经、新闻、科技、体育等板块完全一致。
3. **板块可扩展**：内置财经、综合新闻、科技、体育四个板块；新增板块只需注册一个 profile（代码内声明），不需要改 service/controller。
4. **新开接口**：使用独立的 `/api/news-briefs` 命名空间、独立 collection、独立定时任务与配置前缀（`NEWS_BRIEF_*`），执行 `git diff` 时 `src/daily-brief/` 下不应有业务改动。
5. **复用现有基础设施**：热榜抓取（`FetchHotDataTask`）、历史读取（`HotItemRepository`）、OpenAI SDK、MongoDB、缓存能力，避免另起一套抓取体系。
6. **可运维**：生成失败可重试、可强制重生成、卡死可超时恢复；生成状态可观测。

### 1.3 非目标（明确不做）

| 非目标 | 说明 |
| --- | --- |
| 替换或改造 `/api/briefs` | 现有财经简报的接口、schema、索引、调度、配置默认值全部保持原样 |
| 迁移历史数据 | 不迁移 `dailybriefs` collection，新功能从新 `newsbriefs` 开始 |
| 抓取文章全文 | 内容基于热榜条目（标题/描述）+ 可选搜索摘要生成，不做网页正文抓取（合规与稳定性成本高） |
| 股票/产业链映射 | 财经板块确认**不做**股票关联；`extensions` 机制保留但当前无落地字段；现有 `/api/briefs` 继续负责股票分析 |
| 用户订阅、推送、多语言 | 不在本设计范围 |
| 鉴权 | 服务现状没有任何内建鉴权，新增写接口同样依赖网关层限制（见 11.8） |
| 修改 CLI / Agent Skill | `src/cli` 无简报代码；Agent Skill 只读原则不受影响（见 17） |

## 2. 术语与命名

| 术语 | 英文/代码 | 含义 |
| --- | --- | --- |
| 板块 | `category` | 内容垂类：`finance` / `general` / `tech` / `sports` |
| 新闻简报 | news brief | 某板块某天的一份简报，是持久化与接口返回的主体 |
| 新闻条目 | item | 简报中的一条新闻，统一结构（标题/简介/内容/来源） |
| 来源 | source | 热榜平台（`cls`、`36kr` 等），复用现有 `@HotSource` 注册表 |
| 板块 profile | category profile | 板块的静态定义：名称、定位、数据源、关注点、目标条数 |

命名约定（与现有模块保持一致）：

- 模块目录：`src/news-brief/`（kebab-case，域前缀 `news-brief`）
- Controller 基础路径：`api/news-briefs`
- Mongoose class：`NewsBrief` → collection `newsbriefs`
- 设计文档：`docs/development/news-brief-design.md`（本文；规划产物，暂不加入 VitePress sidebar）
- 实施后新增用户文档：`docs/guide/news-brief.md`

## 3. 与现有每日简报的边界

| 维度 | 现有 `/api/briefs` | 新增 `/api/news-briefs` |
| --- | --- | --- |
| 定位 | 财经产业分析 + A 股关联 | 多板块新闻摘要，结构统一 |
| 输出主体 | `analysis.topics[]`（产业链/股票） | `items[]`（标题/简介/内容/来源） |
| collection | `dailybriefs` | `newsbriefs` |
| 唯一键 | `{ briefDate, period }` | `{ briefDate, period, category }` |
| 调度器 | `daily-brief-generate`（`BRIEF_*`） | `news-brief-generate`（`NEWS_BRIEF_*`） |
| 配置前缀 | `BRIEF_*` | `NEWS_BRIEF_*` |
| 搜索增强 | 默认开启（Tavily/DeepSeek） | P0 不做；P1 可选（默认关闭） |
| 复用 AI 配置 | `OPENAI_*` / `AI_*` | 同样复用，不新增密钥变量 |
| 代码改动面 | 不改动 | 新模块 + 少量增量注册（见 14.2） |

**明确不改动清单**：

- `src/daily-brief/**` 全部文件（模块、controller、service、scheduler、config、clients、interfaces、dto、utils 的现有行为）；
- `dailybriefs` collection 的字段与索引；
- 现有 `/api/briefs/**` 的路由、参数、响应与错误语义；
- 现有环境变量的默认值与校验规则（只允许新增 `NEWS_BRIEF_*`）；
- CLI（`src/cli/**`）与 Agent Skill（`skills/daily-hot-api/**`）。

## 4. 总体设计

### 4.1 分层模板

把「通用」收敛为三层固定模板，所有板块只替换内容，不替换结构：

```text
NewsBrief（简报层）
├── briefDate / period / category / categoryName / status
├── title / summary / highlights[]            ← 整份简报的标题、摘要、要点
├── items[]                                   ← 统一条目结构，核心
│   └── NewsBriefItem
│       ├── id / title / summary / content    ← 新闻标题、简介、内容
│       ├── source { code, name, url }        ← 新闻来源
│       └── publishedAt? / tags? / importance? / extensions?
├── sources[] / inputWindow / model / searchProvidersUsed
└── createdAt / updatedAt / error?
```

- 用户要求的四个字段映射：`新闻标题 → title`、`新闻简介 → summary`、`新闻内容 → content`、`新闻来源 → source`。
- **结构不随板块变化**：前端只需一个新闻列表组件，`category`/`categoryName`/`tags` 用于分组和样式；`extensions` 只承载可选扩展（P2），基础字段永远存在。

### 4.2 模块与数据流

```text
                     ┌────────────────────────────────────────────┐
  Cron / POST generate│ NewsBriefScheduler / NewsBriefController   │
                     └───────────────┬────────────────────────────┘
                                     ▼
                            NewsBriefService
                ┌────────────────────┼─────────────────────┐
                ▼                    ▼                     ▼
        FetchHotDataTask      HotItemRepository      NewsBriefAiClient
        （复用，刷新源并入库） （复用，读回看窗口）    （新建，通用 prompt + zod 校验）
                │                    │                     │
                └──────────┬─────────┘                     │
                           ▼                               │
                候选条目合并/去重/交错排序                    │
                           │                               │
                           ▼                               ▼
                    （P1 可选）NewsBriefSearchService → 结构化 JSON
                           │
                           ▼
                 NewsBriefRepository（claim / heartbeat / markSuccess / markFailed）
                           │
                           ▼
                     MongoDB: newsbriefs
                           │
                           ▼
                 Controller 返回统一 NewsBriefResponse（默认隐藏调试字段）
```

### 4.3 关键设计决策与备选方案

| # | 决策 | 备选方案 | 选择理由 |
| --- | --- | --- | --- |
| D1 | 新模块 `src/news-brief/` | 在 `daily-brief` 内加 `mode` 分支 | 隔离 schema/索引/调度/配置，避免污染现有接口与回归风险；用户明确要求不改现有逻辑 |
| D2 | 每板块一条记录，唯一键 `{briefDate, period, category}` | 一份记录内嵌 `sections[]` | 单板块生成失败/重试互不影响；并发 claim 粒度小；读取层再做聚合接口即可（P1 `digest`），失败隔离优于一次查全 |
| D3 | 条目基础字段 + 可选 `extensions` | 每个板块不同 schema | 前端契约稳定；板块差异不会破坏通用渲染 |
| D4 | 板块定义放代码内 registry，`NEWS_BRIEF_CATEGORIES` 只决定启用哪些 | 全部走环境变量（每个板块一组 `*_SOURCES`） | 板块的 prompt 定位、源清单属于代码资产，静态注册可评审、可 diff；环境变量只保留运行期开关，避免校验规则膨胀 |
| D5 | P0 只做结构化条目（AI 输出 JSON，服务端归一化） | 让 AI 直接输出 Markdown 作为主契约 | Markdown 无法稳定渲染、无法按字段做前端交互；结构化 JSON 可校验、可去重、可追溯来源 URL |
| D6 | 来源 URL 由服务端从候选条目回填，AI 只返回 `sourceRef` | 信任 AI 返回的 URL/来源名 | 防止模型编造链接；回填保证 `source.url` 一定来自真实热榜条目 |
| D7 | P0 不接搜索增强 | 直接复用 `BriefSearchService` | 搜索服务未从 `daily-brief` 导出，复用需要触碰现有模块；P0 先用「标题+描述」生成，P1 再按 9 的方案接入（默认关闭） |
| D8 | 输入组装逻辑在新模块内实现（约 100 行，与现有 service 私有方法同构） | 抽取到公共 util 供两边共用 | 抽公共 util 必须改现有 `daily-brief` 引用；P0 以「运行逻辑零改动」优先，P2 再抽取（见 14.4） |

## 5. 统一内容契约

### 5.1 TypeScript 接口

```ts
// 新闻来源：code 用于机器识别，name 用于展示，url 为原文链接
export interface NewsBriefSource {
  code: string;   // 现有热榜源 code，如 "cls" / "36kr"
  name: string;   // @HotSource 的 title，如 "财联社" / "36氪"
  url: string;    // 原文链接（由服务端从候选条目回填）
}

// 统一新闻条目：所有板块同一结构（服务端归一化后的模型，接口与 DB 共用）
export interface NewsBriefItem {
  id: string;             // 稳定 hash，前端列表 key / 同板块跨次生成去重
  title: string;          // 新闻标题，1–80 字
  summary: string;        // 新闻简介，20–160 字，1–2 句话
  content: string;        // 新闻内容：P0 80–300 字；P1 搜索增强后 80–600 字
  source: NewsBriefSource;
  publishedAt?: string;   // ISO 8601，来自热榜条目 timestamp；缺失则不返回该字段
  tags?: string[];        // 0–5 个标签，单个 ≤ 12 字
  importance?: number;    // 0–100，AI 排序用；前端可用于标红
  extensions?: Record<string, unknown>; // 板块扩展；当前无任何落地字段（财经明确不做股票关联）
}

// AI 实际返回的条目：只有 sourceRef，没有 source / id / publishedAt（服务端回填）
export interface NewsBriefAiItem {
  sourceRef: string;      // 候选条目 ref，服务端生成并下发
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  importance?: number;
}

// AI 实际返回的整份 payload（8.2 的 JSON 契约）
export interface NewsBriefAiPayload {
  title: string;
  summary: string;
  highlights: string[];
  items: NewsBriefAiItem[];
}

// 服务端校验 + 归一化后的内部模型（写入 DB、接口返回）
export interface NewsBriefAnalysis {
  title: string;       // 简报标题，如「科技每日简报」
  summary: string;     // 整份摘要，100–200 字
  highlights: string[];// 3–5 条要点
  items: NewsBriefItem[];
}

// 接口返回（默认前端可见字段）
export interface NewsBriefResponse {
  briefDate: string;          // YYYY-MM-DD
  period: string;             // 默认 daily
  category: string;           // finance | general | tech | sports（可扩展）
  categoryName: string;       // 板块展示名，如「科技」
  status: 'generating' | 'success' | 'failed';
  title?: string;             // generating/failed 时可能为空
  summary?: string;
  highlights: string[];       // generating/failed 时为 []，字段始终存在
  items: NewsBriefItem[];     // generating/failed 时为 []，字段始终存在
  itemCount: number;          // = items.length；为 0 时也返回
  sources: string[];          // 实际参与生成的热榜源 code；未开始抓取时为 []
  inputWindow: { start: string; end: string; lookbackHours: number }; // ISO 字符串
  model?: string;
  searchProvidersUsed: string[]; // P0 恒为 []
  error?: string;             // 仅 failed 时有值
  createdAt?: string;         // ISO 8601
  updatedAt?: string;
}
```

> 数组字段必须**始终存在**（`default: []` + 响应层兜底），否则前端在 `generating`/`failed` 状态下会踩到 `undefined.map`。

### 5.2 成功响应示例

```json
{
  "briefDate": "2026-11-08",
  "period": "daily",
  "category": "tech",
  "categoryName": "科技",
  "status": "success",
  "title": "科技每日简报",
  "summary": "今日科技板块聚焦 AI 芯片供给、国产操作系统发布与智能驾驶监管三条主线……",
  "highlights": [
    "国产 GPU 厂商发布新一代推理芯片",
    "某头部手机厂商调整年度出货目标",
    "智能驾驶新规进入征求意见阶段"
  ],
  "items": [
    {
      "id": "9f2c1d7ab3e4",
      "title": "国产 GPU 厂商发布新一代推理芯片，单卡算力提升 40%",
      "summary": "该厂商称新芯片面向大模型推理场景，已开始向云厂商送样，量产时间未公布。",
      "content": "据发布信息，新一代推理芯片在 FP8 精度下算力较上代提升约 40%，配套软件栈同步更新。厂商表示已向两家云厂商送样，但未披露量产时间与定价。多家行业媒体将其解读为国产算力供给的补充，实际交付节奏仍需观察。",
      "source": {
        "code": "36kr",
        "name": "36氪",
        "url": "https://36kr.com/p/xxxxxx"
      },
      "publishedAt": "2026-11-08T02:10:00.000Z",
      "tags": ["AI", "芯片", "算力"],
      "importance": 88
    }
  ],
  "itemCount": 8,
  "sources": ["36kr", "ithome", "huxiu", "geekpark"],
  "inputWindow": {
    "start": "2026-11-07T00:00:00.000Z",
    "end": "2026-11-08T03:40:00.000Z",
    "lookbackHours": 24
  },
  "model": "deepseek-v4-flash",
  "searchProvidersUsed": [],
  "createdAt": "2026-11-08T03:41:00.000Z",
  "updatedAt": "2026-11-08T03:41:00.000Z"
}
```

### 5.3 字段规则

| 字段 | 必填 | 规则 | 服务端处理 |
| --- | --- | --- | --- |
| `id` | 是 | `sha256(category + '|' + sourceRef)` 取前 12 位。基于 `sourceRef` 而非 AI 标题，保证同一条候选跨次生成 id 稳定；`category` 参与 hash，同一文章出现在不同板块时 id 不同 | 服务端生成，不接受 AI 提供 |
| `title` | 是 | 非空，≤ 80 字 | 超长截断；空则丢弃该条目 |
| `summary` | 是 | 非空，20–160 字 | 不足则用 `content` 首句补齐/截断；空则丢弃该条目 |
| `content` | 是 | 非空；P0 80–300 字，P1 搜索增强后 80–600 字 | 超长截断；空则丢弃该条目 |
| `source` | 是 | 必须能通过 `sourceRef` 回填到候选条目 | AI 只返回 `sourceRef`，服务端查表回填；无法回填则丢弃 |
| `publishedAt` | 否 | ISO 8601（UTC） | 由候选条目 `timestamp` 归一化后转换（`< 1e12` 视为秒、`>= 1e12` 视为毫秒）；无 timestamp 则不返回该字段 |
| `tags` | 否 | ≤ 5 个，单个 ≤ 12 字 | 去重、去空、截断 |
| `importance` | 否 | 0–100 整数 | clamp；缺省按 AI 返回顺序 |
| `extensions` | 否 | 对象，仅服务端按板块白名单写入 | P0 不写入 |

去重规则：**先按 `sourceRef` 去重**（同一候选被 AI 引用多次只保留第一条），再按规范化标题兜底去重。

排序规则：`importance` 降序（缺失排在最后，保持 AI 返回顺序），截断到有效上限 `effectiveMaxItems`：

```text
effectiveMaxItems = min(profile.maxItems, NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY, PROMPT_BUDGET.maxOutputItems)
```

- `NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY` 是**硬上限**（运维可调小），`profile.maxItems` 是板块目标值，两者取 min；prompt 中下发的目标区间也使用 `effectiveMaxItems`（见 8.1）。

### 5.4 extensions 扩展约定

- `extensions` 是**唯一**允许板块差异化的位置，基础字段在任何板块都不允许变形。
- **产品已确认财经板块不做股票关联/产业链**，因此当前没有任何板块写入 `extensions`；字段保留在契约中，供未来其他板块扩展（写入方由服务端白名单控制，P0 不写）。
- 前端对 `extensions` 做可选渲染，缺少时不报错。

### 5.5 失败与空数据形态

| 场景 | HTTP | 响应 |
| --- | --- | --- |
| 查询到简报 | 200 | `NewsBriefResponse` |
| 该日期/板块无简报 | 200 | 空响应体（与现有 `/api/briefs/latest`、`/api/briefs/:date` 一致，前端按空处理） |
| 参数非法（未知板块/来源、日期格式错误） | 400 | Nest 标准错误体 `{ statusCode, message, error }` |
| 生成中已有任务（未 force） | 201 | 结果项 `status: "skipped"`、`reason: "generation_in_progress"`（单次生成接口，见 11.2） |
| 当日已成功（未 force） | 201 | 结果项 `status: "skipped"`、`reason: "already_generated"`，可带已有 `brief` |
| 生成失败，且此前**没有**成功记录 | 201 | 结果项 `status: "failed"`、`error`；数据库中该记录 `status: "failed"` |
| 生成失败，且此前**已有**成功记录（仅 force 重生成会出现） | 201 | 数据库中旧记录保持 `status: "success"` 与旧内容不变（`markFailed` 返回旧成功记录，不覆盖）；结果项 `status: "failed"`、`error`、`previousBriefRetained: true`，并附 `brief` = 被保留的旧简报 |
| 不存在的路由 | 404 | Nest 标准错误体 |

> 说明 1：`POST /api/news-briefs/generate` 可能一次触发多个板块，部分成功必须有表达方式，因此统一返回 `results[]` 而不是直接抛出 500（详细见 11.2）。
> 说明 2：`force=true` 不是"失败就清空"——失败时保留旧成功内容，避免一次模型抖动让前端当天内容消失（与现有 `DailyBriefRepository.markFailed` 语义一致，`src/database/repositories/daily-brief.repository.ts:543-572`）。

## 6. 板块 Profile

### 6.1 注册表结构

文件：`src/news-brief/categories/news-category.registry.ts`（纯常量 + 类型，无依赖注入）

```ts
export interface NewsCategoryProfile {
  code: string;          // 唯一标识，小写
  name: string;          // 展示名
  description: string;   // 一句话定位，写入 /config 与 /categories
  focus: string;         // 注入 system prompt 的关注点
  sources: string[];     // 热榜源 code，必须存在于 HOT_LIST_SOURCES
  maxItems: number;      // 板块目标条数，实际生效值 = min(maxItems, NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY, PROMPT_BUDGET.maxOutputItems)
  search: boolean;       // 板块级搜索增强开关（P1 已生效，见第 9 节）
}

export const NEWS_CATEGORY_PROFILES: NewsCategoryProfile[] = [ ... ];

export function getNewsCategoryProfile(code: string): NewsCategoryProfile | undefined;
export function listEnabledNewsCategories(codes: string[]): NewsCategoryProfile[]; // 保序、去重、未知抛错
```

设计原则：

- registry 是**唯一板块定义源**；`NEWS_BRIEF_CATEGORIES` 只是启用列表与顺序。
- 新增板块 = 加一个 profile 常量 + 单测校验源 code 合法，不需要改 service/controller/DTO。
- 相关代码中所有板块语义校验都在启动时完成（未知 code 直接报错），避免运行期生成一份未知板块的简报。

### 6.2 内置板块（P0）

| code | 名称 | 定位与 AI 关注点 | 默认数据源（复用现有 64 个源） | 目标条数 |
| --- | --- | --- | --- | --- |
| `finance` | 财经 | 货币政策、市场与公司事件、产业经济、宏观数据；**不做个股/产业链推荐** | `cls`, `yicai`, `wallstreet`, `jin10`, `tonghuashun`, `eastmoney`, `gelonghui`, `caixin` | 8 |
| `general` | 综合新闻 | 社会、时政、国际、民生、公共事件 | `thepaper`, `qq-news`, `netease-news`, `sina-news`, `toutiao`, `baidu`, `weibo`, `zhihu` | 8 |
| `tech` | 科技 | AI、半导体、消费电子、互联网产品、开发者生态 | `36kr`, `ithome`, `huxiu`, `geekpark`, `ifanr`, `sspai`, `juejin`, `xinyu` | 8 |
| `sports` | 体育 | 赛事结果与赛程、运动员/俱乐部动态、转会与伤病、体育产业与赛事运营 | `hupu`, `weibo`, `baidu`, `zhihu`, `toutiao`, `tieba`, `bilibili`, `sina-news` | 8 |

**已知限制（必须写进用户文档）**：

1. 体育板块没有专业体育新闻源，依赖虎扑（论坛热帖）+ 综合平台的体育话题，覆盖以热门赛事和讨论为主，深度报道有限；引入专业体育源属于后续优化（新增源还需同步 `skills/daily-hot-api/references/sources.md`，skill CI 会比对注册表）。
2. 板块间数据源有重叠（如微博/头条同时服务综合新闻与体育），同一事件可能出现在两个板块；P0 不做跨板块去重。
3. 数据源启用语义（已按实现核验）：`FetchHotDataTask` 在 `source_configs` 中**查不到该源时视为启用**，只有存在记录且显式 `enabled:false` 才会跳过（`src/scheduler/tasks/fetch-hot-data.task.ts:122-129`）；被跳过的源只记 warn，不阻断其他源。用户文档不要写成"必须在 source_configs 中启用"，避免误导。

### 6.3 环境变量只选择启用板块

```bash
# 默认顺序即 /config、/categories 与调度生成顺序
NEWS_BRIEF_CATEGORIES=finance,general,tech,sports
```

- 校验：非空、去重、保持顺序；未知 code 在**配置校验阶段**报错（`validation.schema.ts` 直接引用 registry 的 code 列表，Nest 建立 Mongo/Redis 连接前即退出并打印可读信息，不会留下悬挂进程）。
- `NEWS_BRIEF_CATEGORIES` 为空字符串视为「全部禁用」还是「配置错误」：按配置错误处理（启动失败），避免静默生成 0 份简报。

## 7. 生成流水线

### 7.1 触发方式

| 方式 | 说明 |
| --- | --- |
| 定时任务 | `NEWS_BRIEF_CRON_EXPRESSION` + `NEWS_BRIEF_TIMEZONE`，一个 cron 生成所有启用板块 |
| 手动接口 | `POST /api/news-briefs/generate`；`category` 指定单板块，缺省生成全部启用板块 |
| 服务启动 | `NEWS_BRIEF_ENABLED=true` 时注册 cron；`false` 时只注册手动接口 |

### 7.2 单板块生成步骤

```text
① 解析参数：category / period(默认 daily) / briefDate(默认今天，按 NEWS_BRIEF_TIMEZONE) / force
② 非 force 且已有 success → 直接返回已有简报（skipped: already_generated）
③ 计算 inputWindow = [end - LOOKBACK_HOURS, end]（end=今天则取 now，历史日期取当天 23:59:59）
④ claimGeneration：原子占位，生成 generationId；已被占用且未超时 → skipped: generation_in_progress
   占用成功后启动 heartbeat（间隔 = min(60s, timeout/3)）
   占位成功且旧记录是 failed → 同时复位 status=generating 并清除旧 error（见 10.3）
⑤ 抓取：并发限制 NEWS_BRIEF_SOURCE_CONCURRENCY 调用 FetchHotDataTask.execute(source)
   - 失败/被禁用的源只记 warn，不阻断其他源
   - 每个源取前 NEWS_BRIEF_TOP_ITEMS_PER_SOURCE 条
   - 来源展示名 name 取自 HotListsService.getAllSourcesWithMetadata()（hot-lists.service.ts:88-96），缺失回退为 source code
   - 同一次 generate() 调用内按来源缓存「在途 promise」：板块之间共用的来源（weibo/baidu/
     zhihu/toutiao/sina-news 同时属于综合新闻与体育）只刷新一次。刷新走 noCache=true 的真实
     上游请求，不去重就是重复打上游 + 重复写历史库
⑥ 历史：HotItemRepository.getDataByTimeRange(source, start, end, NEWS_BRIEF_TOP_ITEMS_PER_SOURCE)
   limit 必须下推到 Mongo，否则 24 小时窗口会把该来源窗口内的全部文档读进内存再丢掉；
   { source: 1, timestamp: -1 } 索引已覆盖 sort + limit
⑦ 合并：按 {source, url} 去重 → 每源按时间倒序 → 按来源轮次交错 → 截断到 NEWS_BRIEF_MAX_CANDIDATES
   轮次上限按最长的来源桶算，不能用 TOP_ITEMS_PER_SOURCE：新鲜 + 历史各取前 N 条，同一来源
   去重后最多有 2N 条，用 N 当上限会在还没到 MAX_CANDIDATES 时白扔掉一半候选
⑧ 候选为空 → 抛错（记录 failed，error="No hot items available for news brief"）
⑨ （P1）搜索增强：搜索对该板块生效时（见第 9 节）按 NEWS_BRIEF_SEARCH_* 为前 N 条候选补充证据
⑩ 调用 NewsBriefAiClient：构造 prompt → OpenAI 兼容接口 → JSON.parse → zod 校验 → 归一化（见 8.3）
⑪ markSuccess：写入 title/summary/highlights/items/rawInputItems/searchEvidence/model 等
⑫ 返回 public projection（隐藏 rawInputItems / searchEvidence / generationId / heartbeat）
```

失败分支：任一步抛错 → `markFailed(briefDate, period, category, generationId, message)`：

- **没有旧成功记录**：记录 `status: failed` + `error`，`results[]` 项为 `failed`；
- **此前已有成功记录**（force 重生成失败）：保留旧成功内容与 `status: success` 不变（`markFailed` 返回旧记录），`results[]` 项为 `failed` + `previousBriefRetained: true`，并附旧 `brief`。
  这与现有 `DailyBriefRepository.markFailed` 的语义一致（`src/database/repositories/daily-brief.repository.ts:543-572`），避免一次模型抖动清空当天已发布内容。

### 7.3 状态机与幂等

复用现有每日简报的「原子 claim + generationId + 心跳 + 超时」方案，按板块维度隔离：

```text
        claimGeneration 成功
(none) ────────────────────► generating ──── markSuccess ───► success
   ▲                             │
   │        markFailed           │  heartbeat 超过
   └─────────────────────────────┴── NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES
                                │
                                ▼
                              failed ──(再次 generate / 定时)──► generating
```

- 唯一索引 `{ briefDate: 1, period: 1, category: 1 }`：同一天同一板块同一 period 只有一条记录。
- claim 使用 `findOneAndUpdate` + `upsert`，条件为「无 generationId / heartbeat 早于 staleBefore」；撞唯一索引 `11000` 时返回 false（并发保护）。
- 心跳由定时器写入 `generationHeartbeatAt`；进程崩溃留下的 `generating` 在超时后允许被无 force 重新 claim。
- `markSuccess`/`markFailed` 都带 `generationId` 条件，旧任务迟到写入不会覆盖新任务。
- force=true 时跳过第 ② 步，但失败仍保留旧成功内容。

### 7.4 并发模型

| 并发维度 | 配置 | 默认 | 说明 |
| --- | --- | --- | --- |
| 板块之间 | `NEWS_BRIEF_CATEGORY_CONCURRENCY` | 1 | 默认串行，避免同时向模型/搜索平台发多个请求；最多不超过启用板块数 |
| 抓取源之间 | `NEWS_BRIEF_SOURCE_CONCURRENCY` | 3 | 复用 `FetchHotDataTask` 自身的全局并发上限（5），不要叠加过大 |
| 搜索之间（P1） | `NEWS_BRIEF_SEARCH_CONCURRENCY` | 3 | 仅在搜索增强开启时生效 |
| 调度重入 | `scheduler.isRunning` | - | cron 触发时若上一轮未结束直接跳过本轮，并记 warn |
| 多实例 | claim + 唯一索引 | - | 多副本部署时同一板块同一天只有一个实例能生成，其余得到 skipped |

## 8. AI 生成与结构化校验

### 8.1 Prompt 结构（新建 `NewsBriefAiClient`，不修改 `AiAnalysisClient`）

- **system prompt**：通用新闻编辑角色 + 统一输出规则，**不含任何板块专属逻辑**。
- **user message**：JSON 字符串，包含板块 profile（code/name/description/focus）、`briefDate`、候选条目（含 `ref`）、可选搜索证据、输出 schema 说明。

核心规则（写死在 prompt 中）：

1. 只能使用「候选条目 + 搜索证据」中的事实，禁止编造引语、数字、时间、机构表态；
2. 每条新闻必须返回 `sourceRef`，取值来自候选条目的 `ref`，禁止自行编造 URL 或来源名（候选 payload 本身不包含 URL，见 8.2）；
3. `title` 不要原样复制候选标题（要整理成新闻标题，≤ 80 字）；
4. `summary` 1–2 句话；`content` 目标长度由服务端下发变量（P0 80–300 字；P1 搜索增强后 80–600 字），信息不足时**短写并注明「细节待核实」**，不得用推测填充；
5. 同一事件合并为一条；按重要性排序；输出条数 = 服务端下发的 `targetItemCount`（`effectiveMaxItems` 的目标区间，默认 3–8 条）；
6. `tags` ≤5 个，中文 ≤12 字；`importance` 0–100 整数；
7. 只输出合法 JSON，不要 Markdown 围栏、不要 HTML。

### 8.2 输出 JSON 契约

```json
{
  "title": "科技每日简报",
  "summary": "今日科技板块……",
  "highlights": ["要点1", "要点2", "要点3"],
  "items": [
    {
      "sourceRef": "a1b2c3d4",
      "title": "新闻标题",
      "summary": "新闻简介",
      "content": "新闻内容",
      "tags": ["AI"],
      "importance": 88
    }
  ]
}
```

- `sourceRef` 是候选条目 `ref`（服务端用 `sha256(source.code + '|' + url)` 前 8 位计算，**url 只留在服务端**）。
- **下发模型的候选 payload 不含 url**（只有 `ref/source/title/desc/hot/timestamp`），模型无法看到、也无法编造真实链接；服务端通过 `sourceRef` 回填 `source { code, name, url }`、`publishedAt`，并生成 `id`。
- 注意：5.1 的 `NewsBriefAnalysis` 是**归一化后**的内部模型（`source` 已回填）；AI 实际返回的是 `NewsBriefAiPayload`（条目只有 `sourceRef`，没有 `source`/`id`/`publishedAt`），两者在 `NewsBriefAiClient` 内完成转换，不对外暴露。

### 8.3 校验与归一化（`NewsBriefAiClient` 内部）

参考 `src/daily-brief/clients/ai-analysis.client.ts:21-71,208-238` 的现状，但适配通用结构：

1. `JSON.parse` 失败 → 抛错，记录 `failed`；
2. zod 解析：基础字段 `.catch()` 兜底为安全值，`items` 必须为数组；
3. 硬校验（与现有「空简报不能标 success」一致）：
   - `title` 为空 → 用 `${categoryName}每日简报` 兜底；
   - `summary` 为空 → 用 highlights 拼接兜底；仍为空 → 失败；
   - 归一化后 `items.length === 0` → 抛错「AI returned no valid news items」；
   - 有效条目 ≥ 1 即视为生成成功；少于 3 条（`maxItems` 默认 8）记 warn 日志，提示源覆盖不足，但**不**标记失败，避免类目可生成但条数少时反复空转；
4. 逐条归一化：`sourceRef` 无法回填 → 丢弃该条；`title`/`summary`/`content` 为空 → 丢弃；长度按 P0/P1 上限截断（P0 content 300 字，P1 600 字）；`tags`/`importance` clamp；`publishedAt` 由 `timestamp` 归一化（`< 1e12` 视为秒、`>= 1e12` 视为毫秒）后转 ISO 字符串；按 5.3 排序并截断到 `effectiveMaxItems`；
5. 去重：**先按 `sourceRef` 去重**（AI 重复引用同一候选时只保留第一条），再按规范化标题兜底去重；同一份简报内同一 `id` 只保留第一条；
6. 输出 `NewsBriefAnalysis`（内部模型：`source`/`id`/`publishedAt` 已回填），由 service 写入数据库。

### 8.4 模型适配与预算

- 复用现有环境变量：`OPENAI_API_KEY`、`OPENAI_API_BASE_URL`、`AI_MODEL`、`AI_TIMEOUT_MS`、`AI_MAX_RETRIES`；**不新增密钥变量**。
- 请求参数：`temperature: 0.3`、`response_format: { type: 'json_object' }`；当 `OPENAI_API_BASE_URL` 指向 DeepSeek 官方域名时，沿用现有适配（`thinking: { type: 'disabled' }`、`max_tokens`），避免 JSON 模式下思考内容干扰。
- 提示词预算（放在 `NewsBriefAiClient` 导出的 `PROMPT_BUDGET` 常量，并用启动校验对齐）：

  | 预算项 | 上限 | 对应配置（启动校验上限） |
  | --- | --- | --- |
  | 候选条目 | 40 | `NEWS_BRIEF_MAX_CANDIDATES` ≤ 40 |
  | 搜索证据（P1） | 8 | `NEWS_BRIEF_SEARCH_MAX_QUERIES` ≤ 8 |
  | 输出条目 | 10 | `NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY` ≤ 10（registry 的 `maxItems` 同样 ≤ 10） |

- 生效条数取 5.3 的 `effectiveMaxItems`（`min(profile.maxItems, 环境变量硬上限, 预算硬上限)`），prompt 只传结果值，三处上限不会互相矛盾。
- 单条截断：标题 160、描述 280（URL 不进入 prompt，无需截断），控制上下文长度。

### 8.5 降级策略

| 失败点 | 处理 |
| --- | --- |
| 单源抓取失败 | warn 日志，跳过该源；其他源继续 |
| 所有源都无数据 | 记录 `failed`，error 明确 |
| AI 请求超时/重试耗尽 | 记录 `failed`；若此前已有成功记录则保留旧内容（见 5.5/7.2） |
| AI 返回无效 JSON / 无有效条目 | 记录 `failed`，不写入空简报 |
| 部分条目校验不通过 | 丢弃该条，其余保留；全部不通过才算失败 |
| claim 阶段 Mongo 抛错 | 该板块返回 `status: failed`（不走 `markFailed`，因为没有占位成功），其余板块照常生成；`generate()` 始终返回每个板块一条 result，不会整体 500 |

## 9. 搜索增强（P1，已实现）

搜索增强默认关闭（`NEWS_BRIEF_SEARCH_ENABLED=false`），开启后为候选新闻补充检索证据，再交给模型写 `content`。

- **能力来源**：复用现有 `TavilySearchClient` / `DeepseekSearchClient`（`src/daily-brief/clients/`），它们提供查询无关的 `search(query)`；新模块的 `NewsBriefSearchService` 负责按 `NEWS_BRIEF_SEARCH_PROVIDERS` 顺序降级，只有配置了密钥的平台才会被调用。
- **复用方式（已落地）**：在 `src/daily-brief/daily-brief.module.ts` 的 `exports` 中追加 `TavilySearchClient`、`DeepseekSearchClient`，`NewsBriefModule` `imports: [DailyBriefModule]`。只增 export，不改变任何现有行为；两份功能共享无状态 client，各自使用自己的配置前缀（`BRIEF_SEARCH_*` vs `NEWS_BRIEF_SEARCH_*`）。
- **查询构造**：`${title} ${desc}`（不追加财经术语），按 `NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS` 截断到 2000 字以内（默认 2000，配置上限 2000）；每条候选最多 1 次搜索，按 `NEWS_BRIEF_SEARCH_MAX_QUERIES` 截断，不超过提示词预算 8 条证据。注意 DeepSeek Search client 自身最多接受 128 个 Unicode 字符，超长 query 会在该 provider 内部被截断，Tavily 不受此限制。
- **缓存**：按 `sha256(provider 列表 + query)` 缓存 1 小时（复用 `CacheService`，key 前缀 `news-brief:search:v1:`），与每日简报的搜索缓存互不冲突。
- **失败处理**：单个 provider/查询失败降级为空证据，不阻断生成；所有 provider 都未配置时记 warn 并跳过；`searchProvidersUsed` 只记录真正返回结果的平台。
- **生效条件（三者同时满足）**：`NEWS_BRIEF_SEARCH_ENABLED=true`、板块 profile 的 `search === true`、`NewsBriefSearchService.isConfigured()` 为真（至少一个平台配了密钥）。判定只看配置、不看单次查询结果，保证同一份配置下提示词形态稳定。板块自己关掉时记一条普通日志，平台都没配密钥时记一条告警，两种情况都直接跳过检索。
- **内容长度升级**：搜索对该板块生效时，prompt 的 `content` 目标长度从 P0 的 80–300 字提升到 80–600 字，并把检索摘要作为证据块下发给模型；**不生效时（包括开了总开关但没配密钥、或板块 `search:false`）必须退回 300 字**，避免模型在 140 字输入上硬凑 600 字（见 R1）。
- **提示词中的证据形态**：只下发 `ref` / `query` / 结果标题与摘要，**不含 URL**；URL 仍由服务端按 `sourceRef` 回填。

## 10. 持久化设计

### 10.1 Mongoose Schema（`src/database/schemas/news-brief.schema.ts`）

```ts
@Schema({ timestamps: true })
export class NewsBrief {
  briefDate: string;        // required, index
  period: string;           // required, default 'daily', index
  category: string;         // required, index
  categoryName: string;     // required，展示名快照（历史数据不随 registry 改名漂移）
  status: 'generating' | 'success' | 'failed';
  title?: string;           // generating/failed 时可缺省
  summary?: string;
  highlights: string[];     // default: []
  items: NewsBriefItemDocument[];  // default: []；子文档数组（_id: false），extensions 为 Mixed
  sources: string[];        // default: []
  inputWindow: { start: Date; end: Date; lookbackHours: number };
  rawInputItems: Mixed[];   // default: []；调试字段，默认投影隐藏
  searchEvidence: Mixed[];  // default: []；调试字段，默认投影隐藏
  model?: string;
  searchProvidersUsed: string[]; // default: []
  error?: string;
  generationId?: string;
  generationHeartbeatAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
```

- `items` 使用**显式子 schema**（`id/title/summary/content/source/publishedAt/tags/importance/extensions`），保证非法写入被 Mongoose 校验，`extensions` 用 `Mixed` 承载扩展。
- `source` 子对象 `{ code, name, url }`（`_id: false`）。
- **claim 的 `$setOnInsert` 必须显式写入 `highlights: []`、`items: []`、`sources`、`searchProvidersUsed: []`**，保证 `generating`/`failed` 记录也能被公共投影安全返回（否则 Mongo 文档缺字段，接口返回的数组会变成 `undefined`）；service 返回前再做一层 `?? []` 兜底。
- **重试一条 `failed` 记录时，claim 成功后要把 `status` 复位成 `generating` 并 `$unset error`**（带 `generationId` + `status:'failed'` 条件的第二次 `updateOne`）。否则整个生成过程中 `/digest` 与 `/:date` 仍然返回 `failed` + 上一次的 `error`，前端会显示「正在重试却一直失败」。**`status === 'success'` 的记录绝不在 claim 里改动**：`force` 重生成要在整个过程中继续返回旧内容，失败时由 `markFailed` 的 retained 分支原样保留（见 7.2）。
- 新 collection 无需数据迁移：首次启动由 Mongoose 自动建索引（与现有 `dailybriefs` 一致）；如需关闭 `autoIndex`，则需在部署脚本中手工建 10.2 的索引，P0 不做该切换。

### 10.2 索引

| 索引 | 用途 |
| --- | --- |
| `{ briefDate: 1, period: 1, category: 1 }` **unique** | 幂等与并发 claim 的基础 |
| `{ category: 1, status: 1, briefDate: -1, createdAt: -1 }` | latest / 按板块查询 |
| `{ status: 1, briefDate: -1, createdAt: -1 }` | 全局最新、列表（P1） |
| `{ briefDate: -1, createdAt: -1 }` | 列表默认排序（P1） |

`briefDate` 存 `YYYY-MM-DD` 字符串，与现有 `dailybriefs` 一致，日期区间查询按字典序即可。

### 10.3 公共投影与 includeDebug

- 默认投影剔除：`rawInputItems`、`searchEvidence`、`generationId`、`generationHeartbeatAt`；`_id` 按需剔除。
- `includeDebug=true` 时返回 `rawInputItems` / `searchEvidence`，用于排查 AI 输入与搜索证据（与现有 `/api/briefs` 的 includeDebug 语义一致，`src/database/repositories/daily-brief.repository.ts:89-94`）。
- 前端常规请求不得携带 `includeDebug`。

### 10.4 容量估算与清理

- 单份简报（含调试字段）：8 条 ×（标题+简介+内容约 400 中文字 / 3B ≈ 1.2 KB）≈ 10 KB，加 `rawInputItems`（40 条候选约 10–20 KB）与搜索证据，合计约 **20–30 KB**（UTF-8 估算，Mongo 存储另计）。
- 4 板块 × 365 天 ≈ **30–45 MB/年**，量级可忽略。
- 清理：P1 提供 `DELETE /api/news-briefs/:date` 与 `DELETE /api/news-briefs/history`（复用现有 `/api/briefs` 的 `olderThan`/`beforeDate` 语义），P0 不做删除接口。

## 11. API 设计

### 11.1 路由总表

| 阶段 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| P0 | `POST` | `/api/news-briefs/generate` | 手动生成（单板块或全部启用板块）；**默认禁用，仅运维可临时开启，前端不得调用**（见 11.2） |
| P0 | `GET` | `/api/news-briefs/config` | 非敏感配置 + 调度实时状态 |
| P0 | `GET` | `/api/news-briefs/categories` | 板块目录（前端筛选用） |
| P0 | `GET` | `/api/news-briefs/latest?category=` | 指定板块最新成功简报 |
| P0 | `GET` | `/api/news-briefs/:date?category=&period=&includeDebug=` | 指定日期简报 |
| P0 | `GET` | `/api/news-briefs/scheduler/status` | 调度状态 |
| P0 | `POST` | `/api/news-briefs/scheduler/start` | 启动调度（当前进程） |
| P0 | `POST` | `/api/news-briefs/scheduler/stop` | 停止调度（当前进程） |
| P0 | `POST` | `/api/news-briefs/scheduler/reconfigure` | 重新注册 cron |
| P1 | `GET` | `/api/news-briefs/digest?categories=&date=` | 多板块聚合读取（一次返回多个板块最新简报） |
| P1 | `GET` | `/api/news-briefs` | 分页查询（page/limit/category/status/period） |
| P1 | `DELETE` | `/api/news-briefs/:date?category=&period=` | 删除指定日期。`category` 必填，避免误删 |
| P1 | `DELETE` | `/api/news-briefs/history?olderThan=&beforeDate=&category=` | 按保留周期清理 |
| P2 | - | - | 财经 `extensions.relatedStocks`、统计接口等 |

**实现状态**：P0 与 P1 路由均已实现（2026-11-08），P2 仍为规划。

**路由声明顺序**：

- GET：`categories`、`config`、`latest`、`digest`、`scheduler/*` 必须声明在 `@Get(':date')` 之前，避免被日期参数路由吞掉（现有 controller 已在 `daily-brief.controller.ts:60-113` 采用同样做法）；
- DELETE（P1）：`history` 必须声明在 `@Delete(':date')` 之前，否则 `/history` 会被 `:date` 参数路由捕获并返回 400；
- `scheduler/*` 用独立子路径，不与 `:date` 冲突，但仍建议统一放前面，便于排序阅读。

### 11.2 手动生成（默认禁用，仅运维使用）

> **产品要求：前端不允许触发任何生成接口。** 服务本身没有鉴权，因此用 `NEWS_BRIEF_MANUAL_GENERATE_ENABLED`（默认 `false`）在应用层禁用该路由；关闭时返回 `403 Forbidden`。运维需要手工补生成时，临时设为 `true` 并重启，或通过调度器/内部任务触发。前端只调用只读 GET 接口。

```bash
# 先临时开启 NEWS_BRIEF_MANUAL_GENERATE_ENABLED=true 并重启服务
# 生成全部启用板块
curl -X POST http://localhost:6689/api/news-briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"force":true}'

# 只生成科技板块
curl -X POST http://localhost:6689/api/news-briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"category":"tech","force":true}'

# 测试：只用一个源生成综合新闻板块（"manual-test" period 不会污染 daily 数据）
curl -X POST http://localhost:6689/api/news-briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"category":"general","sources":["weibo"],"period":"manual-test","force":true}'
```

请求参数：

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `category` | string | 否 | 全部启用板块 | 指定板块 code；未知或未启用 → 400 |
| `date` | string | 否 | 今天（按板块时区） | `YYYY-MM-DD` |
| `period` | string | 否 | `daily` | 用于测试隔离，如 `manual-test` |
| `sources` | string[] | 否 | profile 内的源 | 仅当 `category` 明确时允许；必须是已注册源 |
| `force` | boolean | 否 | false | 已成功时是否强制重新生成 |

响应（固定 `results[]`；Nest 对 `POST` 默认返回 **201**，与现有 `/api/briefs/generate` 一致；请求参数非法时 400，接口未开启时 403）：

```json
{
  "briefDate": "2026-11-08",
  "period": "daily",
  "results": [
    {
      "category": "finance",
      "status": "success",
      "brief": { "briefDate": "2026-11-08", "category": "finance", "items": ["..."] }
    },
    { "category": "general", "status": "skipped", "reason": "already_generated" },
    { "category": "tech", "status": "skipped", "reason": "generation_in_progress" },
    {
      "category": "sports",
      "status": "failed",
      "error": "No hot items available for news brief"
    }
  ]
}
```

- `results[].status`：`success` / `failed` / `skipped`；`skipped.reason`：`already_generated` / `generation_in_progress`。
- 单板块显式请求时同样返回该结构（只有一个 result），避免两种响应形状。
- force 重生成失败且**已有旧成功记录**时，该 result 形如（数据库仍保留旧成功内容，见 5.5/7.2）：

```json
{
  "category": "tech",
  "status": "failed",
  "error": "AI returned no valid news items",
  "previousBriefRetained": true,
  "brief": { "briefDate": "2026-11-08", "category": "tech", "status": "success", "items": ["...旧内容..."] }
}
```

- **超时提醒**：生成全部板块默认串行，单板块 AI 超时为 `AI_TIMEOUT_MS`（默认 120s），4 个板块最坏可能超过 8 分钟。`POST /generate` 是长请求：
  - 调度器内部调用不受 HTTP 超时影响；
  - 前端/网关手动触发时，建议按板块分别调用（便于前端先展示已完成板块），或把反向代理超时调到 ≥ `板块数 × (AI_TIMEOUT_MS + 抓取时间)`；
  - P0 不实现异步任务队列（无 job 状态查询），文档中明确该限制。

### 11.3 配置与板块目录

```bash
curl http://localhost:6689/api/news-briefs/config
```

```json
{
  "enabled": false,
  "cronExpression": "30 8 * * *",
  "timezone": "Asia/Shanghai",
  "categories": [
    { "code": "finance", "name": "财经", "description": "货币政策、市场与公司事件、产业经济、宏观数据", "sources": ["cls", "yicai"], "maxItems": 8 },
    { "code": "general", "name": "综合新闻", "description": "社会、时政、国际、民生、公共事件", "sources": ["thepaper", "qq-news"], "maxItems": 8 },
    { "code": "tech", "name": "科技", "description": "AI、半导体、消费电子、互联网产品、开发者生态", "sources": ["36kr", "ithome"], "maxItems": 8 },
    { "code": "sports", "name": "体育", "description": "赛事结果与赛程、运动员与俱乐部动态、体育产业", "sources": ["hupu", "weibo"], "maxItems": 8 }
  ],
  "lookbackHours": 24,
  "topItemsPerSource": 8,
  "maxCandidates": 40,
  "maxItemsPerCategory": 8,
  "categoryConcurrency": 1,
  "sourceConcurrency": 3,
  "generatingTimeoutMinutes": 30,
  "generatingTimeoutMinutes": 30,
  "manualGenerateEnabled": false,
  "model": "deepseek-v4-flash",
  "searchEnabled": false,
  "searchProviders": ["tavily", "deepseek"],
  "searchMaxQueries": 6,
  "searchQueryMaxChars": 2000
}
```

- `enabled` 取调度器实时状态（`isEnabled()`），与现有 `/api/briefs/config` 一致；`NEWS_BRIEF_ENABLED` 只是启动默认值。
- `/api/news-briefs/categories` 返回同样的板块数组（不含运行配置），供前端首屏筛选项使用。

### 11.4 最新简报

```bash
curl 'http://localhost:6689/api/news-briefs/latest?category=tech'
curl 'http://localhost:6689/api/news-briefs/latest?category=tech&period=daily'
curl 'http://localhost:6689/api/news-briefs/latest?category=tech&includeDebug=true'
```

- `category` **必填**：省略时返回 400 并列出可用板块。原因：`latest` 只返回单份简报，若默认返回"任意板块最新一条"，前端无法预期内容。
- 只返回 `status=success` 的记录；不存在时返回 200 空响应体。
- `period` 缺省为 `daily`（与 `:date` 接口一致，避免 `manual-test` 等测试数据意外成为"最新"）；需要其他 period 时显式传入。空串 `?period=` 视同缺省（前端 URLSearchParams 常带空值），不会返回 400。
- 默认隐藏调试字段；`includeDebug=true` 时返回 `rawInputItems`/`searchEvidence`。

### 11.5 指定日期简报

```bash
curl 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech'
curl 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech&period=manual-test&includeDebug=true'
```

- `category` 必填；`period` 默认 `daily`；返回该日期该板块的记录（可能是 `generating`/`failed`，`error` 字段可见）。
- 参数校验：`date` 必须匹配 `^\d{4}-\d{2}-\d{2}$`（DTO 校验，参考 `src/daily-brief/dto/brief-date-param.dto.ts`）。

### 11.6 调度接口

```bash
curl http://localhost:6689/api/news-briefs/scheduler/status
curl -X POST http://localhost:6689/api/news-briefs/scheduler/start
curl -X POST http://localhost:6689/api/news-briefs/scheduler/stop
curl -X POST http://localhost:6689/api/news-briefs/scheduler/reconfigure
```

`status` 响应：

```json
{
  "isRunning": false,
  "enabled": false,
  "cronExpression": "30 8 * * *",
  "timezone": "Asia/Shanghai",
  "categories": ["finance", "general", "tech", "sports"],
  "cronJobExists": false
}
```

语义与现有 `/api/briefs/scheduler/*` 完全一致：start/stop 只改当前进程内存状态，重启后回到 `NEWS_BRIEF_ENABLED`；reconfigure 只重建 cron，不覆盖运行期 start/stop。

### 11.7 P1 读取/清理接口（已实现）

多板块聚合读取（前端首页一次请求）：

```bash
curl 'http://localhost:6689/api/news-briefs/digest?categories=finance,tech'
```

```json
{
  "briefDate": "2026-11-08",
  "categories": [
    { "category": "finance", "categoryName": "财经", "status": "success", "brief": { "...": "..." } },
    { "category": "tech", "categoryName": "科技", "status": "missing", "brief": null }
  ]
}
```

- `categories` 缺省 = 全部启用板块（按 `NEWS_BRIEF_CATEGORIES` 顺序）；未知或未启用 code → 400；`date` 缺省今天，`period` 缺省 `daily`。
- `categories[].status` 为**读取层状态**：有记录时透出数据库状态（`success|generating|failed`），无记录时为 `missing`；`brief` 在有记录时返回公开投影，无记录时 `null`。数据库枚举仍只有三种。
- 实现用 N 次 `findOne` 并行读取；数据库连接级失败会让整个 digest 请求失败（不承诺单板块降级）。重复 query 参数会被合并为逗号分隔，不引入 aggregation。

分页列表（不返回 `items`）：

```bash
curl 'http://localhost:6689/api/news-briefs?category=tech&status=success&period=daily&page=1&limit=10'
```

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
      "updatedAt": "2026-11-08T03:41:00.000Z"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```

- 参数：`page`（≥1，默认 1）、`limit`（1–100，默认 20）、`category`（可选，未知 → 400）、`status`（`success|generating|failed`）、`period`（默认 `daily`）。
- `itemCount` 由分页聚合的 `$size` 计算（MongoDB 6.0 可用）；聚合管道已接入 `mongo-compatibility.spec.ts`。

删除（破坏性操作，无内建鉴权）：

```bash
# 安全 no-op 检查（期望 deletedCount: 0）
curl -X DELETE 'http://localhost:6689/api/news-briefs/1900-01-01?category=tech&period=manual-test'

# 删除某板块某天的记录
curl -X DELETE 'http://localhost:6689/api/news-briefs/2026-11-08?category=tech'
```

```json
{
  "mode": "date",
  "briefDate": "2026-11-08",
  "category": "tech",
  "period": null,
  "deletedCount": 1
}
```

- `DELETE /:date` 的 `category` **必填**（避免一次误删全部板块）；`period` 省略表示删除该板块该日期的全部 period。
- 按保留周期清理（`olderThan` 与 `beforeDate` 二选一）：

```bash
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?beforeDate=1900-01-01'  # 安全 no-op
curl -X DELETE 'http://localhost:6689/api/news-briefs/history?olderThan=1m&category=tech'
```

```json
{
  "mode": "beforeDate",
  "olderThan": null,
  "beforeDate": "1900-01-01",
  "category": null,
  "deletedCount": 0
}
```

- `olderThan` 支持 `30d` / `1m` / `1y` 及 `month` / `year` 别名；`category` 可选（缺省清理全部板块）。
- 路由顺序见 11.1（`history` 在 `:date` 之前）；删除路径不维护读取缓存（当前无缓存），网关必须限制写接口来源。

### 11.8 错误语义与安全

| 情况 | 行为 |
| --- | --- |
| `category` 未知/未启用 | 400，`message` 中列出当前可用 code |
| `sources` 含未注册源，或与多板块请求同时出现 | 400 |
| `date` 非法 / `period` 非法 | 400（DTO + service 校验；`date` 严格 `^\d{4}-\d{2}-\d{2}$`，`period` 限制 `^[a-z0-9][a-z0-9-]{0,31}$` 并拒绝保留值之外的奇怪输入） |
| `includeDebug` 仅接受 `true`/`false` | 其他值按 false |
| `POST /generate` 且 `NEWS_BRIEF_MANUAL_GENERATE_ENABLED=false` | 403 `{ statusCode, message, error }`，message 提示该接口仅限运维、前端不得调用 |
| 写接口无鉴权 | 与现有服务一致：`POST /generate`（默认已禁用）、`scheduler/*`、`DELETE /api/news-briefs/*` 会消耗费用或修改数据，**必须由反向代理/网关限制来源**，不得裸露公网。注意 `scheduler/start` 会注册 cron 并在下一调度点真正生成，敏感度与 `generate` 相同 |

## 12. 配置项

### 12.1 新增环境变量（P0）

| 变量 | 类型 | 默认值 | 校验规则 | 说明 |
| --- | --- | --- | --- | --- |
| `NEWS_BRIEF_ENABLED` | boolean | `false` | `envBoolean`（复用现有 helper） | 启动时是否注册 cron |
| `NEWS_BRIEF_CRON_EXPRESSION` | string | `30 8 * * *` | 非空 | 生成 cron（与现有 12:00 错开） |
| `NEWS_BRIEF_TIMEZONE` | string | `Asia/Shanghai` | 非空 | 日期与 cron 时区 |
| `NEWS_BRIEF_CATEGORIES` | string | `finance,general,tech,sports` | 非空、去重、保序；未知 code 启动报错 | 启用板块及顺序 |
| `NEWS_BRIEF_LOOKBACK_HOURS` | number | `24` | ≥ 1 | 历史回看窗口 |
| `NEWS_BRIEF_TOP_ITEMS_PER_SOURCE` | number | `8` | int 1–20 | 每源纳入候选条数 |
| `NEWS_BRIEF_MAX_CANDIDATES` | number | `40` | int 10–40（与 `PROMPT_BUDGET.maxCandidates` 对齐） | 进入 prompt 的候选上限 |
| `NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY` | number | `8` | int 3–10（与 `PROMPT_BUDGET.maxOutputItems` 对齐） | 每份简报输出条数 |
| `NEWS_BRIEF_SOURCE_CONCURRENCY` | number | `3` | ≥ 1 | 抓取源并发 |
| `NEWS_BRIEF_CATEGORY_CONCURRENCY` | number | `1` | int 1–4 | 板块生成并发 |
| `NEWS_BRIEF_GENERATING_TIMEOUT_MINUTES` | number | `30` | ≥ 1 | generating 超时后允许重新生成 |
| `NEWS_BRIEF_MANUAL_GENERATE_ENABLED` | boolean | `false` | `envBoolean` | 是否允许 `POST /generate`；默认关闭，前端不得调用（见 11.2） |

### 12.2 P1 搜索增强环境变量（已实现）

| 变量 | 类型 | 默认值 | 校验规则 | 说明 |
| --- | --- | --- | --- | --- |
| `NEWS_BRIEF_SEARCH_ENABLED` | boolean | `false` | `envBoolean` | 搜索增强总开关 |
| `NEWS_BRIEF_SEARCH_MAX_QUERIES` | number | `6` | int 1–8（与 `PROMPT_BUDGET.maxSearchEvidence` 对齐） | 每板块最多搜索的候选条数 |
| `NEWS_BRIEF_SEARCH_CONCURRENCY` | number | `3` | ≥ 1 | 同时搜索数 |
| `NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS` | number | `2000` | int 100–2000 | 单条搜索词最大字符数（产品要求 2000 字以内） |
| `NEWS_BRIEF_SEARCH_PROVIDERS` | string | `tavily,deepseek` | 仅 `tavily`/`deepseek`、唯一（参考 `BRIEF_SEARCH_PROVIDERS` 的 refine） | 平台优先级；留空关闭 |

### 12.3 复用的现有变量（不新增）

`OPENAI_API_KEY`、`OPENAI_API_BASE_URL`、`AI_MODEL`、`AI_TIMEOUT_MS`、`AI_MAX_RETRIES`；P1 搜索复用 `TAVILY_API_KEY`、`TAVILY_MAX_RESULTS`、`TAVILY_TIMEOUT_MS`、`DEEPSEEK_SEARCH_API_KEY` 等。

### 12.4 配置读取链路

- 默认值**只写在** `src/config/validation.schema.ts`（AGENTS.md 约定）。
- 新增 `NewsBriefConfigService`（`src/news-brief/news-brief.config.ts`），所有读取走 `getOrThrow`，不在 service/scheduler 里重复写默认值（对齐 `DailyBriefConfigService` 的模式，`src/daily-brief/daily-brief.config.ts:5-13`）。
- 需要同步：`.env.example`、`docs/reference/environment-variables.md`、`docs/guide/news-brief.md`（实施时）。

## 13. 调度设计

- 新建 `NewsBriefScheduler`（`src/news-brief/news-brief.scheduler.ts`），cron 名 `news-brief-generate`。
- **不新增** `ScheduleModule.forRoot()`：现有唯一的 `forRoot()` 在 `src/scheduler/scheduler.module.ts:12`；新模块按 `daily-brief.module.ts` 的方式 `imports: [ScheduleModule, ..., SchedulerModule]`，即可注入 `SchedulerRegistry`。
- 生命周期：`onModuleInit` 注册 cron → `onModuleDestroy` 注销；`start/stop/reconfigure/isEnabled/getStatus` 与 `DailyBriefScheduler` 同构（`src/daily-brief/daily-brief.scheduler.ts:27-123`）。
- `handleCron`：`isRunning` 防重入 → 按 `NEWS_BRIEF_CATEGORIES` 顺序、`categoryConcurrency` 并发调用 `service.generate({})`，单板块失败只记日志不影响其他板块 → 轮末记录成功/失败统计。
- 与现有 `daily-brief-generate`、`hot-data-fetch` 相互独立，互不阻塞。
- `POST /api/news-briefs/generate` **不受** `NEWS_BRIEF_ENABLED` 影响：该变量只控制启动时是否注册 cron；关闭定时任务时仍可手动生成（与现有 `/api/briefs/generate` 行为一致）。
- 可观测性（P0）：沿用 Nest `Logger`，统一前缀 `[NewsBrief]`；关键日志包括：每板块开始/结束（板块、耗时、条目数、模型）、单源无数据/被禁用 warn、claim 冲突 warn、markFailed error、调度轮次汇总。P0 不新增 metrics 端点；`/api/news-briefs/config` + `/scheduler/status` 提供运行期状态。

## 14. 复用与代码接触面

### 14.1 新增文件（P0）

```text
src/news-brief/
  news-brief.module.ts
  news-brief.controller.ts
  news-brief.service.ts
  news-brief.scheduler.ts
  news-brief.config.ts
  categories/news-category.registry.ts
  clients/news-brief-ai.client.ts
  clients/news-brief-search.service.ts        # P1 搜索增强（复用 daily-brief client）
  interfaces/news-brief.interface.ts
  dto/generate-news-brief.dto.ts
  dto/news-brief-date-param.dto.ts
  dto/list-news-briefs-query.dto.ts           # P1 分页列表
src/database/schemas/news-brief.schema.ts
src/database/repositories/news-brief.repository.ts
```

测试（已实现，与现有 spec 风格一致）：

```text
src/news-brief/news-brief.config.spec.ts
src/news-brief/categories/news-category.registry.spec.ts
src/news-brief/clients/news-brief-ai.client.spec.ts
src/news-brief/news-brief.service.spec.ts
src/config/validation.schema.spec.ts（新增 NEWS_BRIEF_* 用例）
```

### 14.2 修改文件（P0，全部为增量改动）

| 文件 | 改动 | 风险 |
| --- | --- | --- |
| `src/app.module.ts` | `imports` 增加 `NewsBriefModule` | 极低（仅新增模块） |
| `src/database/database.module.ts` | `forFeature` 增加 `NewsBrief`，新增并导出 `NewsBriefRepository` | 低（增量注册） |
| `src/config/validation.schema.ts` | 新增 `NEWS_BRIEF_*` 字段与校验 | 低（只增不改现有字段） |
| `src/config/validation.schema.spec.ts` | 增加 `NEWS_BRIEF_*` 默认值、预算越界（`MAX_CANDIDATES`/`MAX_ITEMS_PER_CATEGORY`）用例；不放宽现有 `BRIEF_*` 断言 | 低（只增用例） |
| `.env.example` | 新增 `NEWS_BRIEF_*` 注释块 | 无 |
| `README.md` | 「功能特性」增加一条通用新闻简报（或说明与每日简报并列） | 无 |
| `docs/**`、`AGENTS.md` | 见 17 | 无 |

P1 追加（仅在实现 P1 接口时）：

| 文件 | 改动 |
| --- | --- |
| `src/daily-brief/daily-brief.module.ts` | `exports` 追加 `TavilySearchClient`、`DeepseekSearchClient`，供 P1 搜索增强复用；**只增 export，不改行为** |
| `src/database/repositories/mongo-compatibility.spec.ts` | 把 `NewsBriefRepository` 的聚合管道接入该 spec（显式实例化并抽取算子），不是只扩白名单 |
| `docs/development/news-brief-frontend.md` | 新增前端接入文档 |

### 14.3 复用矩阵

| 能力 | 来源 | 复用方式 | 是否改现有代码 |
| --- | --- | --- | --- |
| 热榜抓取 + 入库 | `SchedulerModule` → `FetchHotDataTask` | `imports: [SchedulerModule]` | 否 |
| 历史条目读取 | `DatabaseModule` → `HotItemRepository.getDataByTimeRange` | `imports: [DatabaseModule]` | 仅新增一个可选 `limit` 参数（默认不限制，不影响每日简报与 history 接口的既有调用） |
| 来源展示名 | `HotListsModule` → `HotListsService.getAllSourcesWithMetadata()`（`src/host-lists/hot-lists.service.ts:88-96`） | `imports: [HotListsModule]` | 否 |
| 日期/时区 | `src/daily-brief/utils/brief-date.ts`（`formatBriefDate`/`endOfBriefDate`） | 直接 import 纯函数 | 否 |
| 并发工具 | `src/daily-brief/utils/concurrency.ts`（`mapWithConcurrency`） | 直接 import 纯函数 | 否 |
| 缓存 | `CacheModule` → `CacheService` | `imports: [CacheModule]`（P1 搜索缓存用） | 否 |
| AI 调用 | 新建 `NewsBriefAiClient`（OpenAI SDK + zod 已是依赖） | 新写通用 client，不改 `AiAnalysisClient` | 否 |
| 搜索增强（P1） | `daily-brief` 的搜索 clients | 按 9 的二选一方案 | 视方案 |

> 纯函数跨 feature import（`daily-brief/utils/*`）是 P0 的刻意取舍：两文件无副作用、无 DI，复用可避免时区逻辑写错；P2 再迁到 `src/common/utils/` 并同步改调用点。

### 14.4 明确不触碰

运行逻辑零改动：`src/daily-brief/**` 行为、`src/cli/**`、`skills/**`、现有 `dailybriefs` schema/repository/索引、现有环境变量默认值、现有路由与响应语义。P1 唯一触碰现有文件的是 `daily-brief.module.ts` 的 `exports` 追加两个搜索 client（纯依赖注入导出，不改任何逻辑，`/api/briefs` 行为不变）。

需要同步的工程文件仅为增量：`validation.schema.spec.ts` 增用例、`README.md` 增说明、枚举型文档（调度器/持久化/架构）增条目——这些不改变任何现有运行时行为，但**"整个工程零改动"的说法不成立**，实施时按 14.2/17 清单一起改。

## 15. 分阶段实施计划

### P0：可用闭环（建议先做）

范围：

1. schema + repository（claim/heartbeat/markSuccess/markFailed/find*）；
2. `NewsBriefConfigService` + `NEWS_BRIEF_*` 配置与启动校验；
3. 板块 registry（4 个内置板块）；
4. `NewsBriefAiClient`（通用 prompt + zod + sourceRef 回填 + 归一化）；
5. `NewsBriefService`（抓取/历史/合并/AI/落库/失败处理）；
6. `NewsBriefController` + DTO（generate/config/categories/latest/:date/scheduler*）；
7. `NewsBriefScheduler` + `NewsBriefModule` 注册；
8. 单元测试 + 文档（`guide/news-brief.md`、reference 三件套、`.env.example`、`docs/.vitepress/config.mts`、`docs/index.md`、`docs/guide/scheduler.md`、`docs/guide/configuration.md`、`docs/development/architecture.md`、`docs/development/database-and-cache.md`、`AGENTS.md`、`README.md`、`validation.schema.spec.ts`）。

验收标准：

- `npm run build`、`npx eslint "src/**/*.ts"` 通过；
- `git diff --stat` 中 `src/daily-brief/**` 无改动；
- `NEWS_BRIEF_ENABLED=false` 启动时 `/api/news-briefs/config` 返回 `enabled:false`，不注册 cron；
- 单板块手动生成（真实模型 1 次调用）返回 `results[0].status=success`，每条 item 的 `title/summary/content/source` 非空且 `source.url` 来自输入候选；
- 无数据/模型异常时记录 `failed`，不会写入空简报；
- 同一板块并发两次生成，第二次返回 `skipped: generation_in_progress`；
- 旧任务超时后无 force 可重新生成。

### P1：可运营与可读性（已实现，2026-11-08）

- `GET /api/news-briefs/digest` 多板块聚合读取（N 次 findOne，读取层 `missing` 状态）；
- `GET /api/news-briefs` 分页列表（`NewsBriefRepository.list()` 聚合，items 不返回）；
- `DELETE /api/news-briefs/:date` 与 `DELETE /api/news-briefs/history`（category 必填/可选、`olderThan` 与 `beforeDate` 互斥）；
- 搜索增强（默认关闭，复用 daily-brief 的搜索 client，`searchEvidence` 存调试字段、`searchProvidersUsed` 返回）；
- 前端接入文档 `docs/development/news-brief-frontend.md`；
- `mongo-compatibility.spec.ts` 接入 `NewsBriefRepository` 的分页聚合管道；
- 新增 5 个 `NEWS_BRIEF_SEARCH_*` 环境变量与 P1 单测。

P1 验收：`npm run build`、`npx eslint "src/**/*.ts"`、`npx jest` 通过；`GET /digest`/`GET` 列表/两个 `DELETE` 的只读与安全 no-op 验证通过；搜索增强开启后真实验证 1 条证据回填且 `searchProvidersUsed` 正确。

### P2：增强

- 跨板块去重（同一事件只保留在一个板块）；
- 专业体育源接入（会同步 `skills/daily-hot-api/references/sources.md`，skill CI 会比对注册表）；
- 抽取 `src/common/`（日期、并发、热榜输入组装、AI transport、搜索）供两个简报功能共用；
- 只读 GET 接口补进 Agent Skill `references/api.md`（可选，写接口永远不纳入 skill）。

### 上线与回滚

- **上线顺序**：先合并代码（`NEWS_BRIEF_ENABLED=false` 默认关闭）→ 部署后用 `/api/news-briefs/config`、`/categories`、`/scheduler/status` 验证只读接口 → 手动 `POST /generate`（单板块、`period=manual-test`）验证真实链路 → 打开 `NEWS_BRIEF_ENABLED=true` 并重启让 cron 生效。
- **回滚**：把 `NEWS_BRIEF_ENABLED=false` 并重启（cron 不再注册，已有数据仍可读）；需要彻底下线时回滚代码提交即可——新 collection 独立存在，不影响现有 `/api/briefs`；如需清理数据，按 P1 的 `DELETE` 路由或运维脚本处理，不在回滚路径中自动删除。
- **开关语义**：`NEWS_BRIEF_ENABLED` 只决定进程启动时是否注册 cron；运行期用 `/api/news-briefs/scheduler/start|stop` 临时启停，重启后回到环境变量值（与现有简报一致）。

## 16. 测试与验证

### 16.1 单元测试

| 测试文件 | 覆盖点 |
| --- | --- |
| `news-category.registry.spec.ts` | code 唯一；sources 均存在于 `HOT_LIST_SOURCES`；maxItems 在 3–10；启用顺序保序/去重/未知 code 抛错 |
| `news-brief.config.spec.ts` | 默认值来自 validation schema；`getOrThrow` 行为；分类解析；非法并发/上限配置启动报错（参考 `daily-brief.config.spec.ts`） |
| `news-brief-ai.client.spec.ts` | prompt 构造包含 category/focus；`sourceRef` 回填正确；未知 ref 条目被丢弃；空 items 抛错；长度截断/clamp/去重/排序；无效 JSON 抛错；DeepSeek 域名参数分支（mock OpenAI client） |
| `news-brief.service.spec.ts` | 非 force 命中 success 直接返回；claim 冲突；force 失败保留旧 success（DB 保持 success + 结果项 failed）；无候选报错并 markFailed；多板块部分失败；心跳/超时清理；`sources` 覆盖仅单板块生效；`latest` 默认 period=daily；跨板块共用来源只刷新一次；历史查询下推 limit；候选轮次不被 TOP_ITEMS_PER_SOURCE 截断、到 MAX_CANDIDATES 即停；板块 `search:false` 与平台未配密钥时跳过检索且 content 维持 300；claim 抛错时该板块 failed、其他板块仍 success |
| `news-brief.repository.spec.ts` | claim 的过期/冲突/11000 分支；claim 把 `failed` 复位成 `generating` 并清 `error`；claim 不动 `success` 记录；`markFailed` 的 retained 与 failed 两条分支 |
| `src/config/validation.schema.spec.ts`（增量用例） | `NEWS_BRIEF_*` 默认值；`NEWS_BRIEF_MAX_CANDIDATES` / `NEWS_BRIEF_MAX_ITEMS_PER_CATEGORY` 越界抛错；不破坏现有 `BRIEF_*` 断言 |
| `src/database/repositories/mongo-compatibility.spec.ts` | 接入 `NewsBriefRepository` 的分页聚合管道；6.0 算子白名单 |
| `news-brief-search.service.spec.ts`（P1） | provider 顺序、跳过未配置、失败/空结果降级、全失败返回 `provider:null`、`isConfigured` |
| `news-brief.service.spec.ts`（P1 增量） | digest 默认板块/`missing`/未知 category；list 分页参数与未知 category；deleteByDate category 必填与 period 省略；deleteHistory 二选一与 olderThan 解析；搜索开启/关闭、未配置降级、query 截断、缓存命中、`contentMaxChars=600`、`searchEvidence` 落库 |
| `news-brief-ai.client.spec.ts`（P1 增量） | 证据进入 prompt 且不含 URL、结果条数上限、600 字截断 |
| DTO spec（可选） | `date` 格式、`sources` 数组、`force` 布尔、`period` 字符集、list 分页参数 |

### 16.2 手动验证（不消耗模型费用）

```bash
npm run build
npx eslint "src/**/*.ts"

PORT=6699 BRIEF_ENABLED=false NEWS_BRIEF_ENABLED=false npm run start:prod

curl http://localhost:6699/api/news-briefs/config
curl http://localhost:6699/api/news-briefs/categories
curl http://localhost:6699/api/news-briefs/scheduler/status
curl 'http://localhost:6699/api/news-briefs/latest?category=tech'   # 空响应体
curl 'http://localhost:6699/api/news-briefs/2026-11-08?category=tech' # 空响应体
curl -X POST http://localhost:6699/api/news-briefs/generate \
  -H 'Content-Type: application/json' -d '{"category":"unknown"}'      # 400
```

### 16.3 手动验证（消耗模型费用，验证环境执行）

```bash
# 单源、单板块、manual-test，避免污染正式数据
curl -X POST http://localhost:6699/api/news-briefs/generate \
  -H 'Content-Type: application/json' \
  -d '{"category":"general","sources":["weibo"],"period":"manual-test","force":true}'

# 校验统一结构
curl -s 'http://localhost:6699/api/news-briefs/2026-11-08?category=general&period=manual-test' | node -e '
let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
  const x=JSON.parse(s);
  console.log(x.items.map(i=>({title:!!i.title,summary:!!i.summary,content:!!i.content,source:i.source})));
});'

# 默认不返回调试字段；includeDebug=true 才返回
curl -s 'http://localhost:6699/api/news-briefs/2026-11-08?category=general&period=manual-test' | node -e '
let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
  const x=JSON.parse(s);
  console.log({raw:Object.hasOwn(x,"rawInputItems"),evidence:Object.hasOwn(x,"searchEvidence")});
});'
```

### 16.4 兼容性与验收

- 聚合管道（P1 的 digest/list）改动后运行 `npx jest src/database/repositories/mongo-compatibility.spec.ts`：该 spec 显式实例化各 repository，必须把 `NewsBriefRepository` 接入并抽取新算子，不能只改白名单；任何新算子先确认 MongoDB 6.0 可用；
- 浏览器/前端联调前确认响应字段与 5.1 契约一致（camelCase、ISO 时间、`YYYY-MM-DD` 日期、可选字段缺省不返回）；
- 回归确认现有 `/api/briefs/*` 行为不变（可用现有测试 + 手动 `GET /api/briefs/config`）。

## 17. 文档同步清单

P0 实施时（与代码同一次变更）：

| 文档/配置 | 动作 |
| --- | --- |
| `docs/guide/news-brief.md` | **新增**：功能概览、数据流、环境变量、数据结构、API 示例、测试命令、注意事项（骨架对齐 `docs/guide/daily-brief.md`） |
| `docs/reference/api.md` | 新增「新闻简报」h2 与路由三列表，链接到 guide；不并入 `/api/briefs` 表格 |
| `docs/reference/data-structures.md` | 新增 `NewsBrief` / `NewsBriefItem` 接口定义 |
| `docs/reference/environment-variables.md` | 新增 `NEWS_BRIEF_*` 表格 |
| `.env.example` | 新增 `NEWS_BRIEF_*` 注释块 |
| `docs/.vitepress/config.mts` | `/guide/` sidebar 增加「通用新闻简报」 |
| `docs/index.md` | 增加功能卡片（与现有 AI 每日简报并列，明确两者区别） |
| `docs/guide/configuration.md` | 「两个自动调度器」改为三个，开发/生产示例补 `NEWS_BRIEF_ENABLED=false` |
| `docs/guide/scheduler.md` | 开头「两套定时任务」改为三套（抓取、AI 每日简报、通用新闻简报） |
| `docs/development/architecture.md` | 持久化模型「三类」→四类、调度器「两类」→三类、模块列表补 `src/news-brief/` |
| `docs/development/database-and-cache.md` | MongoDB 说明与关键索引列表补 `NewsBrief` |
| `AGENTS.md` | 增加 `src/news-brief/` 目录、`NewsBrief` API 摘要、`NEWS_BRIEF_*` 配置、验证清单；明确与 `daily-brief` 的边界 |
| `README.md` | 功能特性补一条（通用新闻简报） |
| `src/config/validation.schema.spec.ts` | 新增 `NEWS_BRIEF_*` 默认值与越界用例 |
| `docs/development/news-brief-design.md`（本文） | 实施后标记为「已实现」并在 guide 中回链；若方案调整需同步更新 |

不修改 `docs/guide/daily-brief.md` / `docs/development/daily-brief-frontend.md`（避免把两个功能写成别名）。

P1 已完成：`docs/development/news-brief-frontend.md`、digest/list/delete 接口文档、5 个搜索变量、`mongo-compatibility.spec.ts` 接入说明（均已随 P1 实现同步）。

CLI 与 Agent Skill：**不改动**。理由：`src/cli` 无简报逻辑；Agent Skill 只读且不调用简报写接口；新 GET 路由可在后续按需补充到 skill 的 `references/api.md`，P0 不做。

## 18. 风险与缓解

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | AI 编造内容/链接 | 内容不可信、合规风险 | 候选 payload 不含 URL、只回 `sourceRef` 并由服务端回填链接；信息不足写「细节待核实」；**P0 content 限制 80–300 字**，不承诺是基于全文的报道；文档明确 content 为"基于热榜标题/摘要的整理"，P1 搜索增强后才放宽到 600 字 |
| R2 | 成本翻倍（4 板块 × AI 调用，P1 还有搜索） | 运行费用上升 | 默认 `NEWS_BRIEF_ENABLED=false`；P0 不接搜索；预算上限（40 候选/8 输出）；板块默认串行；提供 `/config` 与日志统计 |
| R3 | 体育板块无专业体育新闻源，内容覆盖有限 | 体育板块体验不达预期 | 明确写进文档（依赖虎扑 + 综合平台体育话题）；P2 引入专业体育源（需同步 skill references） |
| R4 | 与现有财经简报概念重叠 | 用户/前端混淆两套接口 | 命名与文档强区分：`/api/news-briefs` 为通用新闻摘要、不含股票映射；`/api/briefs` 保持财经分析；前端分开展示 |
| R5 | 并发/重试导致重复或覆盖 | 数据被旧任务覆盖 | 复用 claim + generationId + heartbeat + 唯一索引；mark 操作带 generationId 条件；多实例由唯一索引兜底 |
| R6 | 板块间内容重复 | 同一事件出现多次 | P0 接受（不同板块视角不同）；P2 设计跨板块去重；文档说明 |
| R7 | 新增 env / 默认值不一致 | 配置错误难排查 | 默认值只在 `validation.schema.ts`；启动校验未知板块/超限配置；文档三处同步 |
| R8 | Mongo 6.0 聚合不兼容（P1） | 查询报错 | 复用现有 `mongo-compatibility.spec.ts` 白名单机制 |
| R9 | 生成耗时/超时 | 调度互相拖累 | 板块级超时与失败隔离；`categoryConcurrency` 默认 1；`generatingTimeoutMinutes` 可配；调度器 `isRunning` 防重入 |
| R10 | 数据量增长 | 存储成本 | 容量估算约 30–45 MB/年；P1 提供清理接口 |
| R11 | 手动生成全部板块是长请求 | 反向代理 60s 超时导致请求失败但后台已生成 | 11.2 已说明：前端按板块调用或调大网关超时；调度器内部调用不受影响；P0 不引入异步任务队列 |

## 19. 决策记录与开放问题

### 19.1 已确认决策（2026-11-08）

| # | 决策 | 落地方式 |
| --- | --- | --- |
| D-A | 板块为财经、综合新闻、科技、**体育**四个，**不含汽车** | `NEWS_BRIEF_CATEGORIES=finance,general,tech,sports`；registry 不含 auto |
| D-B | 财经板块**不做**股票关联/产业链 | 不实现 `extensions.relatedStocks`；`extensions` 保留为空机制 |
| D-C | 手动生成接口保留，但**前端不允许触发** | `NEWS_BRIEF_MANUAL_GENERATE_ENABLED=false` 默认禁用 `POST /generate`（403），仅运维临时开启；前端只用 GET |
| D-D | P1 搜索词上限 2000 字 | `NEWS_BRIEF_SEARCH_QUERY_MAX_CHARS=2000`（P1 实现）；查询按该长度截断 |
| D-E | 前端长请求/异步问题 | 前端不触发生成，长请求问题只影响运维手工调用；P1 未引入异步任务 |
| D-F | P1 搜索复用方式 | 在 `daily-brief.module.ts` 的 `exports` 追加 Tavily/Deepseek client（只增 export）；`NewsBriefModule` import `DailyBriefModule` |
| D-G | P1 读取接口 | `digest` 用 N 次 `findOne`；`list` 用分页聚合；`DELETE` 两路由已实现并需要网关限制 |

### 19.2 仍待确认（不阻塞 P0）

| # | 问题 | 建议默认 | 影响 |
| --- | --- | --- | --- |
| Q1 | 各板块默认源清单是否认可（体育依赖虎扑+综合平台，覆盖有限）？是否需要环境变量按板块覆盖 sources？ | 认可清单；P0 不支持 env 覆盖 | 数据质量 |
| Q2 | 「新闻内容」P0 为基于标题/摘要的整理（80–300 字，不抓全文），是否满足？ | 满足；P1 搜索增强后再放宽到 600 字 | 内容质量预期 |
| Q3 | ~~搜索增强的复用方式~~ | 已确认并实现：`exports` 追加两个 client | P1 已落地 |
| Q4 | ~~是否需要多板块聚合接口 digest~~ | 已实现 `GET /digest` | P1 已落地 |
| Q5 | 定时任务时间：默认 `30 8 * * *`（与现有 12:00 错开）是否合适？ | 按本文 | 调度 |
| Q6 | 是否需要把新功能同步进 Agent Skill / CLI 文档？ | P0 不同步，P2 评估只读接口 | 文档范围 |

## 附录 A：Prompt 草稿

**system**

```text
你是一名严谨的中文新闻编辑，负责把当日热点榜单整理成「板块新闻简报」。
你只使用给定的候选条目和检索证据中的信息；不得编造引语、数字、时间、机构表态或链接。
信息不足时，在 content 中明确写「细节待核实」，不要用推测填充。
同一事件合并为一条；按重要性从高到低排序。
只输出合法 JSON，不要输出 Markdown 围栏、HTML 或解释性文字。
```

**user（JSON 序列化后发送；注意候选不回传 url）**

```json
{
  "instruction": {
    "outputLanguage": "zh-CN",
    "targetItemCount": "3–8（服务端下发 effectiveMaxItems 对应区间）",
    "contentTarget": "80–300 字（P0；P1 搜索增强后 80–600 字）",
    "requiredJsonShape": {
      "title": "string，简报标题",
      "summary": "string，100–200 字，整份简报摘要",
      "highlights": ["string，3–5 条要点"],
      "items": [
        {
          "sourceRef": "string，必须取自候选条目的 ref",
          "title": "string，新闻标题，≤80 字",
          "summary": "string，新闻简介，20–160 字",
          "content": "string，新闻内容，长度见 contentTarget",
          "tags": ["string，≤5 个"],
          "importance": "number，0–100"
        }
      ]
    },
    "rules": [
      "items 数量按 targetItemCount",
      "sourceRef 必须是候选 ref，禁止编造",
      "标题不要原样复制候选标题",
      "不得输出候选之外的新闻",
      "content 信息不足时短写并注明「细节待核实」"
    ]
  },
  "category": { "code": "tech", "name": "科技", "description": "...", "focus": "..." },
  "briefDate": "2026-11-08",
  "candidates": [
    {
      "ref": "a1b2c3d4",
      "source": "36kr",
      "title": "...",
      "desc": "...",
      "hot": 1234,
      "timestamp": 1762560000000
    }
  ],
  "searchEvidence": []
}
```

- **候选不包含 `url`**：模型只能看到 `ref`，`source { code, name, url }` 由服务端按 `sourceRef` 回填，从机制上避免链接幻觉。
- P1 搜索开启时追加 `searchEvidence`（`ref` / `query` / 最多 3 条结果的标题与摘要，**同样不含 URL**）：
  ```json
  [{ "ref": "a1b2c3d4", "query": "新闻标题 描述", "results": [{ "title": "...", "content": "..." }] }]
  ```
- `contentTarget` 由服务端按「搜索是否对该板块生效」下发（见第 9 节的三个条件）：不生效 `80–300` 字，生效 `80–600` 字。
- AI 返回的 JSON 对应 5.1 的 `NewsBriefAiPayload`，经校验/归一化后才是 `NewsBriefAnalysis`。

服务端追加：`temperature: 0.3`、`response_format: { type: 'json_object' }`，DeepSeek 官方地址时关闭思考模式并设置 `max_tokens`。

## 附录 B：现有实现参考（file:line）

| 参考点 | 位置 |
| --- | --- |
| 现有生成流程/状态机 | `src/daily-brief/daily-brief.service.ts:54-197` |
| claim/heartbeat/markSuccess/markFailed | `src/database/repositories/daily-brief.repository.ts` 的 `claimGeneration` / `heartbeatGeneration` / `markSuccess` / `markFailed` |
| 唯一索引与字段 | `src/database/schemas/daily-brief.schema.ts:78` |
| AI 调用与 zod 校验模式 | `src/daily-brief/clients/ai-analysis.client.ts:21-71,92-108,208-238` |
| includeDebug 公开投影 | `src/database/repositories/daily-brief.repository.ts:89-94` |
| 调度器结构 | `src/daily-brief/daily-brief.scheduler.ts:27-123`、`src/scheduler/scheduler.module.ts:12` |
| 抓取任务与源启用校验 | `src/scheduler/tasks/fetch-hot-data.task.ts:123-136` |
| 来源元数据（展示名） | `src/host-lists/hot-lists.service.ts:88-96` |
| 日期/时区工具 | `src/daily-brief/utils/brief-date.ts` |
| 配置默认值唯一来源 | `src/config/validation.schema.ts:34-80` |
| 文档约定 | `AGENTS.md`「Feature Documentation」「Configuration」「Verification Checklist」 |
