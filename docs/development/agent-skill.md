# Agent Skill 维护与发布说明

`skills/daily-hot-api` 是仓库内的 Agent Skill（[agentskills.io 规范](https://agentskills.io/specification)）。本文件记录设计取舍、脚本契约、版本策略和发布 SOP，供后续 AI/维护者参考。面向用户的安装说明见[使用指南](/guide/agent-skill)。

## 设计决策

| 决策 | 原因 |
| --- | --- |
| 单 skill，放在主仓 `skills/` | 一个连贯工具一个 skill；`npx skills add HelTi/daily-hot-api` 可直接发现，无需额外仓库 |
| L1 CLI 包装 | 复用已发布的 `@ttkit/daily-hot-api`，确定性执行、无需把 NestJS 逻辑搬进 skill |
| 不修改业务代码 | skill 只新增文件；不引入 `HOST`、不调整 `engines`，保持现有发布流程不变 |
| 自动实例最小配置 | 当前服务监听 `0.0.0.0`，最小配置无 AI Key/无 Mongo，暴露面仅公开热榜数据 |
| 默认缓存、默认 10 条、desc 截断 | 控制上下文体积与上游压力 |
| 只读简报 | 生成消耗 AI 配额，必须由用户显式发起 |
| CLI 固定版本 | 供应链安全与可复现：`npx --yes @ttkit/daily-hot-api@0.1.3`，禁止 `@latest`。CLI 子进程跑在 `os.tmpdir()`，不继承 cwd——否则 cwd 所在项目能提供同名 bin 时 npx 会无视版本号 |

已知限制：

- Node 22.20+ 可用，但 CLI 包 `engines` 仍声明 >=24；已在 22.23.2 实测 start/status/stop/hot list。
- 服务端不支持 `HOST` 配置，隔离实例仍监听所有网卡（无敏感配置，风险可接受）；未来若加 `--host`，skill 启动参数同步改为 `127.0.0.1`。
- 历史/简报依赖用户自建实例，skill 不管理其 Mongo/Key。

## 目录结构

```text
skills/daily-hot-api/
├── SKILL.md                 # 元数据 + 工作流 + 硬规则（<500 行）
├── scripts/
│   ├── daily-hot.mjs        # 唯一入口
│   └── lib/
│       ├── cli.mjs          # CLI 发现、版本比较、子进程执行
│       ├── errors.mjs       # SkillError 与退出码
│       ├── http.mjs         # fetch 超时、健康检查、JSON 错误映射
│       └── service.mjs      # 实例发现、隔离启动、停止、状态目录
└── references/              # 按需加载：api/sources/history/daily-brief/remote-deploy/troubleshooting

evals/daily-hot-api/
├── trigger-queries.json     # 10 正 / 10 负触发评测集
├── run-trigger-eval.mjs     # catalog / claude / codex 三种 provider
└── README.md
```

SKILL.md 只保留高频步骤和硬规则；详细接口、来源、排障放 `references/`，保持渐进披露。

## 服务发现与隔离策略

解析顺序：`--base-url`/`DAILY_HOT_API_BASE_URL` → skill 状态目录 → 默认 6689 → 自动启动。

- 自动启动状态目录：`DAILY_HOT_API_SKILL_HOME`，默认 `~/.daily-hot-api-skill`。
- 配置 `skill.env`：随机/默认端口、`BRIEF_ENABLED=false`、`SCHEDULER_AUTO_START=false`、`MONGODB_URI` 指向不可达地址（避免误连用户 Mongo）。
- 启动标记：`.started-by-skill`；`stop` 只处理带标记的实例。
- 标记在 CLI 确认进程已启动之后、健康检查之前写入；`stop` 只在 CLI 返回 0 时删除标记。健康检查失败或停止失败都不会丢标记，保证实例始终可停。
- 实例探测优先读标记里的 `baseUrl` 直接打 `/health`，命中就不再 spawn CLI；`detectCli()` 的结果在单进程内缓存。
- 用户自己启动的实例永远只读：不 stop、不改配置。

## 脚本契约

命令：`doctor` `ensure` `status` `sources` `hot` `history search` `brief` `stop`。

- stdout 只输出 JSON；stderr 输出诊断与修复建议。
- 非交互、幂等；`ensure` 可重复调用。
- `hot` 默认 `limit=10`、`desc` 截断 160 字符、去掉 `mobileUrl`；`--full` 返回原始。
- `history`/`brief` 默认截断长字段，避免上下文膨胀。
- 退出码：`0` 成功、`2` 用法/4xx、`3` 前置条件、`4` 服务/5xx、`5` 未运行（与 CLI 的 `3=未运行` 不同，注意区分）。
- 环境变量：`DAILY_HOT_API_BASE_URL`、`DAILY_HOT_API_SKILL_HOME`、`DAILY_HOT_API_CLI`、`DAILY_HOT_API_LOCAL_PORT`。

## 版本策略

| 版本位 | 位置 | 规则 |
| --- | --- | --- |
| skill 版本 | `SKILL.md` → `metadata.version` | 独立 semver，首发 `1.0.0`；功能变更 minor，文案/描述 patch |
| CLI 兼容版本 | `scripts/lib/cli.mjs` → `CLI_PIN`、`metadata.cli-version` | 最低兼容版本：本地 CLI >= 该版本时复用，否则 npx 使用该精确版本；升级前先跑功能矩阵 |
| 发布 tag | `skill-vX.Y.Z` | 与 npm 的 `v0.1.x` 区分 |

CLI 发版后 1 周内：更新 `CLI_PIN` → 跑 `node --test test/skill/*.test.mjs` + 本地生命周期验证 → 更新 references 中受影响的行为 → 发 skill patch。CI 会对比 pin 与 npm 最新版并输出 warning（不失败）。

## 测试

```bash
# 单元 + mock 集成测试（不依赖真实服务/外网）
node --test test/skill/*.test.mjs

# 规范校验（需 pip install skills-ref；实际命令是 agentskills）
agentskills validate skills/daily-hot-api

# 本地发现
npx -y skills@1.7.4 add . --list
```

测试覆盖：参数解析、URL/日期校验、结果瘦身、命令透传、4xx/5xx/未运行退出码、`--param` 透传（含驼峰 key）、用法错误先于连服务、简报未完成状态的 `note`、`stop` 失败保留标记、标记命中时不 spawn CLI、`stop` 不误停。

CI：`.github/workflows/skill-ci.yml` 在 Node 22.20 与 24 上分别执行规范校验、`node --check`、`node --test`、`npx skills add . --list` 发现断言。

## 触发评测

评测集在 `evals/daily-hot-api/trigger-queries.json`（10 正 / 10 负），脚本在 `evals/daily-hot-api/run-trigger-eval.mjs`，详细用法见 `evals/daily-hot-api/README.md`。

```bash
# 只校验数据集与 SKILL.md（CI 会跑）
node evals/daily-hot-api/run-trigger-eval.mjs --dry-run

# 用 OpenAI 兼容接口模拟宿主路由（看 name/description 是否够用）
set -a; source ./.env; set +a
node evals/daily-hot-api/run-trigger-eval.mjs --provider catalog --runs 3 \
  --report /tmp/trigger-report.md

# 真实宿主验证（会消耗对应账号额度，建议 runs=1）
node evals/daily-hot-api/run-trigger-eval.mjs --provider claude --runs 1
node evals/daily-hot-api/run-trigger-eval.mjs --provider codex --runs 1
```

判定规则：每个 query 跑 `--runs` 次，触发率 ≥ 0.5 记为触发；正样本召回 ≥ 0.9、负样本特异度 ≥ 0.9、错误数 ≤ 0 才通过（退出码 1 表示未通过）。报告会列出误触发/漏触发及模型理由。

发布前要求：`catalog` 跑 3 次 + 至少一个真实宿主跑 1 次均通过；修改 `description` 后必须重跑。负样本要选“近义但能力不同”的请求（抓正文、评论、行情、天气、爬虫、监控等），而不是完全不相关的请求。

## 发布 SOP

1. `agentskills validate skills/daily-hot-api`
2. `node --test test/skill/*.test.mjs`
3. `npx -y skills@1.7.4 add . --list` 确认发现
4. 干净环境功能验证（Node 22.20 与 24 各一次）：
   `doctor` → `ensure` → `hot zhihu --limit 5` → `sources` → `stop`
5. `npx skills add HelTi/daily-hot-api --skill daily-hot-api -g -a claude-code -y` 安装验证
6. 更新 README / docs / AGENTS；发 `skill-vX.Y.Z` tag
7. GitHub Release 写安装命令与兼容版本
8. 发布后从干净环境安装几次触发 skills.sh 收录（无提交入口，靠遥测）
9. 监控 7 天：issue、安装量、失败反馈

## 常见维护任务

- **API 行为变化**：更新 `references/api.md`、脚本 normalize 逻辑与测试。
- **新增/下线来源**：来源清单以 `/hot-lists/all` 为准；只在 `references/sources.md` 维护常用集合与专属参数，不做硬编码校验。
- **CLI 新增参数**：评估是否透传到脚本；优先用 `--param` 覆盖来源专属参数（key 允许字母开头的字母/数字/`_`/`-`，含驼峰）。
- **新增热榜来源**：同步 `references/sources.md`，CI 会对比来源注册表与该文档，不一致直接失败。
- **Node/CLI 升级**：更新 `CLI_PIN`、`compatibility`、CI matrix，跑发布 SOP 第 4 步。
- **上游失效**：项目侧修 source；skill 侧只需更新排障提示。

## 已知风险

| 风险 | 对策 |
| --- | --- |
| Node 24 门槛 vs skill 声明 22.20 | 文档写清实测范围；CI 覆盖 22.20/24；`doctor` 给建议 |
| 服务监听 0.0.0.0 | 自动实例最小配置；文档警示；远程实例要求反代鉴权 |
| 上游来源不稳定 | 默认缓存、单源超时、如实报错、不承诺全量可用 |
| 首次 npx 下载慢/国内网络 | 文档给镜像与全局安装备选 |
| skill/CLI 版本漂移 | 固定 pin + CI warning + 发版 SOP |
| frontmatter 兼容性 | 只保留官方 6 字段；Author/version 放 metadata |
