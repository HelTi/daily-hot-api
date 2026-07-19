# 系统架构

Daily Hot API 是一个 NestJS 单体服务，按业务能力拆分模块。HTTP 控制器只负责参数接收和响应，抓取、缓存、持久化、调度及 AI 生成分别由对应服务处理。

## 请求与数据流

```text
客户端
  │
  ├─ /hot-lists/* ──────> HotListsController
  │                         └─ HotListsService
  │                              └─ HotListSource providers
  │                                   └─ HttpClientService ──> 外部站点
  │                                            │
  │                                            └─ CacheService ──> Redis / 内存
  │
  ├─ /api/history/* ─────> HistoryService ─────> HotItemRepository ──> MongoDB
  │
  ├─ /api/scheduler/* ───> SchedulerService ───> 热榜抓取 + 历史持久化
  │
  └─ /api/briefs/* ──────> DailyBriefService
                             ├─ 热榜与历史数据
                             ├─ TavilySearchClient
                             ├─ AiAnalysisClient
                             └─ DailyBriefRepository ──> MongoDB
```

## 核心模块

| 模块 | 目录 | 职责 |
| --- | --- | --- |
| `AppConfigModule` | `src/config` | 加载、转换和验证环境变量 |
| `CacheModule` | `src/cache` | Redis 缓存与进程内存降级 |
| `HttpClientModule` | `src/http` | 封装来源请求、超时与缓存 |
| `HotListsModule` | `src/host-lists` | 数据源注册、发现与统一热榜 API |
| `DatabaseModule` | `src/database` | Mongoose Schema 和 Repository |
| `HistoryModule` | `src/history` | 历史热点搜索、统计与范围查询 |
| `SchedulerModule` | `src/scheduler` | 定时抓取、手动触发和来源配置 |
| `DailyBriefModule` | `src/daily-brief` | 搜索增强、AI 分析、简报存储和调度 |
| `TokenModule` | `src/token` | 个别来源需要的签名和 Token 逻辑 |

## 热榜源发现

每个数据源同时满足三项条件：

1. 使用 `@Injectable()` 注册为 Nest Provider。
2. 使用 `@HotSource()` 声明名称、标题、类型和站点信息。
3. 实现 `HotListSource.getList()`。

`HotListsService` 在 `onModuleInit` 中通过 `DiscoveryService` 遍历 Provider，读取 `HOT_SOURCE_METADATA` 并注册到内存 Map。控制器随后可通过来源 ID 查找实现。

新增来源的完整步骤见[添加热榜源](/development/add-hot-source)。

## 持久化模型

MongoDB 当前包含三类业务文档：

- `HotItem`：历史热点，使用 `source + url` 识别同来源内容。
- `SourceConfig`：来源启用状态、抓取间隔和最后抓取时间。
- `DailyBrief`：简报状态、结构化分析、Markdown、原始输入和搜索证据。

Schema 在 `src/database/schemas`，数据访问集中在 `src/database/repositories`。新 Schema 必须在 `DatabaseModule` 中通过 `MongooseModule.forFeature()` 注册，并导出对应 Repository。

## 两类调度器

项目包含两个独立调度区域：

- `src/scheduler`：抓取热点并保存历史数据。
- `src/daily-brief/daily-brief.scheduler.ts`：生成 AI 每日简报。

二者都通过 `SchedulerRegistry` 动态管理 Cron。`ScheduleModule.forRoot()` 只应在应用中初始化一次，重构模块时需验证启动阶段仍能正确注册任务。

## 外部依赖降级

- Redis 采用延迟连接；不可用时部分缓存使用进程内存。
- MongoDB 连接失败会记录警告，进程尽量继续运行，但历史、调度持久化和简报功能不可用。
- 单个热点来源失败不会让来源注册表整体失败，统一响应可能包含空 `data` 和错误 `message`。
- Tavily 或模型配置缺失会影响简报生成，不影响实时热榜接口。
