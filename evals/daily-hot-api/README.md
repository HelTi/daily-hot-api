# daily-hot-api 触发评测

验证 `skills/daily-hot-api/SKILL.md` 的 `description` 是否在真实请求中正确触发/不触发。评测集见 [trigger-queries.json](trigger-queries.json)：10 个正样本 + 10 个近义负样本。

## 快速开始

### 1. catalog provider（默认，推荐）

用 OpenAI 兼容接口模拟宿主做技能路由判断，只看 `name + description`，适合快速迭代 description：

```bash
# 在自己的 shell 里导出项目已有的 OpenAI 兼容配置（不会读取或打印 .env）
set -a; source ./.env; set +a

node evals/daily-hot-api/run-trigger-eval.mjs \
  --provider catalog --runs 3 \
  --report /tmp/trigger-report.md
```

可用配置（按优先级）：

| 项 | 参数 | 环境变量 |
| --- | --- | --- |
| Base URL | `--base-url` | `TRIGGER_EVAL_API_BASE_URL` → `OPENAI_API_BASE_URL` |
| Model | `--model` | `TRIGGER_EVAL_MODEL` → `AI_MODEL` |
| API Key | `--api-key-env NAME`（默认 `OPENAI_API_KEY`） | 对应环境变量 |

脚本只从进程环境读取 Key，不会读取 `.env`，也不会把 Key 写进输出。默认 20×3=60 次模型调用；DeepSeek 等兼容接口成本很低，但仍建议先用 `--runs 1` 试跑。

### 2. Claude Code / Codex provider（真实宿主）

```bash
# Claude Code：需要已安装并登录 claude CLI
node evals/daily-hot-api/run-trigger-eval.mjs --provider claude --runs 1

# Codex：需要已安装并登录 codex CLI
node evals/daily-hot-api/run-trigger-eval.mjs --provider codex --runs 1
```

脚本会：

1. 创建临时目录，把 skill 复制到 `.claude/skills/` 或 `.agents/skills/`；
2. 用 `claude -p --output-format stream-json` / `codex exec --json` 运行 query；
3. 从输出中检测是否触发 skill。

不同版本的 CLI 输出格式可能变化，可用 `--trigger-pattern <正则>` 覆盖默认检测规则。

### 3. 只校验评测集（CI / 本地快速检查）

```bash
node evals/daily-hot-api/run-trigger-eval.mjs --dry-run
```

不调用模型，校验 SKILL.md frontmatter、评测集结构，并输出配置摘要，退出码 0。

## 判定逻辑

- 每个 query 运行 `--runs` 次（默认 3）；
- 单 query 触发率 ≥ `--trigger-rate`（默认 0.5）判定为“触发”；
- 正样本召回 ≥ `--min-positive`（默认 0.9）且负样本特异度 ≥ `--min-negative`（默认 0.9）才算通过；
- 运行错误数 > `--max-errors`（默认 0）也判失败；
- 退出码：`0` 通过，`1` 未通过，`2` 用法错误，`3` 配置/依赖缺失。

## 输出

stdout 是 JSON 结果；进度写 stderr。可额外写：

```bash
--report /tmp/trigger-report.md   # Markdown 报告
--json-out /tmp/trigger-result.json
```

报告包含召回/特异度/准确率、误触发/漏触发列表，以及每个 query 的触发率和模型理由。

## 评测集格式

```json
{
  "skill": "daily-hot-api",
  "version": 1,
  "queries": [
    {
      "id": "pos-01",
      "query": "帮我看看今天微博热搜都有哪些？",
      "should_trigger": true,
      "category": "hot-list",
      "rationale": "直接请求实时热榜数据。"
    }
  ]
}
```

约定：

- 至少 8 正 / 8 负（`--allow-small` 仅用于调试）；
- `id` 唯一；
- 负样本优先选“近义但能力不同”的请求（抓正文、评论、行情、天气、爬虫、监控等），而不是完全不相关的请求；
- 修改 description 后重新跑评测，报告中的误触发/漏触发会直接指出需要收窄或补充的边界。

## 注意

- 触发评测只验证 `description` 的匹配，不验证 skill 执行结果；功能验证见 `test/skill/daily-hot.test.mjs`。
- 不要提交包含真实 API Key 的报告或日志；本脚本输出不包含 Key。
- Claude/Codex provider 会消耗对应账号额度，建议 `--runs 1`。
