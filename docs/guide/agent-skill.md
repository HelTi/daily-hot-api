# Agent Skill（给 AI Agent 用）

`skills/daily-hot-api` 是发布在仓库里的 Agent Skill：安装后，Claude Code、Codex、Cursor、Copilot、OpenCode、OpenClaw 等支持 [Agent Skills](https://agentskills.io/specification) 的 agent 可以按需调用 daily-hot-api，获取 60+ 平台的热榜、历史热点和只读的 AI 每日简报。

## 它解决什么问题

没有 skill 时，agent 需要自己找接口、处理签名/分页/中文编码、管理进程。安装后，agent 只需运行脚本：

- 自动发现或启动一个本地 daily-hot-api 实例；
- 默认查询 10 条并截断长描述，避免把整份榜单灌进上下文；
- 结果保留排名、标题、热度和链接，方便直接汇总；
- 历史/简报需要用户自建实例时，通过 `DAILY_HOT_API_BASE_URL` 只读连接。

## 环境要求

- Node.js >= 22.20（推荐 24 LTS；CLI 包 `engines` 声明 >= 24，Node 22 下为警告不阻断）
- 可访问 npm registry（首次运行需要 npx 下载 CLI，约 1 MB）
- 可访问各热榜来源站点
- macOS / Linux；Windows 建议使用 WSL 或 Git Bash

## 安装

使用 [`skills` CLI](https://www.skills.sh/docs/cli)：

```bash
# 安装到当前项目（默认）
npx skills add HelTi/daily-hot-api --skill daily-hot-api

# 安装到用户级，所有项目可用
npx skills add HelTi/daily-hot-api --skill daily-hot-api -g

# 只装到指定 agent，非交互
npx skills add HelTi/daily-hot-api --skill daily-hot-api -g -a claude-code -y
```

查看仓库里有哪些 skill：

```bash
npx skills add HelTi/daily-hot-api --list
```

安装后，agent 会自动加载该 skill 的 `name` 和 `description`，在相关任务中触发。

## 使用

直接用自然语言问 agent 即可，例如：

- “今天微博、知乎、B 站都有什么热点？各取前 10 条。”
- “汇总一下今天科技圈的热榜，给出来源链接。”
- “最近一周 AI 相关的历史热点有哪些？”（需要已配置 MongoDB 的实例）
- “读一下今天的 AI 每日简报。”（需要已生成过简报的实例）

agent 会依次执行 `doctor` → `ensure` → `sources`/`hot` 等命令。也可以手动运行脚本调试：

```bash
cd <skill 安装目录>
node scripts/daily-hot.mjs doctor
node scripts/daily-hot.mjs sources
node scripts/daily-hot.mjs hot zhihu --limit 10
node scripts/daily-hot.mjs hot weibo --type hot
node scripts/daily-hot.mjs brief latest
node scripts/daily-hot.mjs stop
```

## 实例从哪里来

skill 按以下顺序选择服务实例：

1. `DAILY_HOT_API_BASE_URL` 或 `--base-url` 指定的已有实例（只读）；
2. `~/.daily-hot-api-skill` 中本 skill 之前启动的实例；
3. `http://127.0.0.1:6689` 上用户自己用 CLI 启动的实例（只读，不会停止它）；自定义端口可用 `DAILY_HOT_API_LOCAL_PORT` 覆盖探测端口；
4. 自动后台启动一个隔离实例。

隔离实例的配置是：

```dotenv
BRIEF_ENABLED=false
SCHEDULER_AUTO_START=false
MONGODB_URI=mongodb://127.0.0.1:1/daily-hot-api-skill-disabled
```

它**不会读取当前目录的 `.env`**，也不会连接用户本机 MongoDB；因此只提供实时热榜，不能查历史、不能生成简报。

### 连接带 MongoDB / AI Key 的自建实例

按[命令行工具](/guide/cli)或 [Docker 部署](/operations/docker)启动一个完整实例，然后：

```bash
export DAILY_HOT_API_BASE_URL=http://127.0.0.1:6689
node scripts/daily-hot.mjs doctor
node scripts/daily-hot.mjs history search --source zhihu --keyword AI
node scripts/daily-hot.mjs brief latest
```

远程实例请放在带鉴权的反向代理后；服务本身没有鉴权。

## 状态目录

| 内容 | 路径 |
| --- | --- |
| 隔离实例配置 | `~/.daily-hot-api-skill/skill.env` |
| CLI 运行状态 | `~/.daily-hot-api-skill/daily-hot-api.json` |
| 日志 | `~/.daily-hot-api-skill/logs/daily-hot-api.log` |
| 启动标记 | `~/.daily-hot-api-skill/.started-by-skill` |

可用 `DAILY_HOT_API_SKILL_HOME` 覆盖。`stop` 只停止带启动标记的实例；停止失败时标记会保留，可以直接重试 `stop`。

## 更新与卸载

```bash
# 更新已安装的 skill
npx skills update

# 卸载
npx skills remove daily-hot-api
```

skill 版本与最低兼容的 CLI 版本记录在 `SKILL.md` 的 `metadata` 中；运行时会优先复用本地已安装的 CLI，没有或版本过低时通过 npx 使用固定版本（不使用 `@latest`）。

## 安全与隐私

- skill 不收集遥测；数据只在本机与热榜上游站点之间流动。
- 自动启动的实例只绑定 `127.0.0.1`（写入 `HOST=127.0.0.1`，需要 CLI >= 0.1.3），不会暴露到局域网；配置中也没有 AI Key、没有 Mongo 连接，只暴露公开热榜数据。
- 不会读取、打印用户 `.env`、API Key 或状态文件内容。
- 不会调用生成简报、删除历史、调度器等写接口。
- 上游热榜是公开数据，但请遵守各站点使用条款，不要高频强制刷新。

## 排查

```bash
node scripts/daily-hot.mjs doctor
```

常见问题：

| 现象 | 处理 |
| --- | --- |
| 提示 Node 版本不满足 | 升级到 Node >= 22.20（推荐 24 LTS） |
| 首次运行慢 | npx 正在下载 CLI；国内网络可配置 npm 镜像 |
| 历史/简报 500 | 实例未连接 MongoDB，改用自建实例 |
| 热点来源失败 | 换同类来源或稍后重试，不要反复刷新 |
| 端口冲突 | 脚本会自动换端口；失败时查看日志路径 |

## 限制

- 只支持“热榜快照”类查询，不抓取文章正文、评论或任意 URL。
- 不提供实时监控/推送。
- 不自动生成 AI 简报（会消耗配额，需用户显式发起）。
- 上游来源可能临时失效，skill 会如实报错，不保证所有来源始终全部可用。

## 相关文档

- [命令行工具](/guide/cli)
- [获取热榜](/guide/hot-lists)
- [历史热点](/guide/history)
- [AI 每日简报](/guide/daily-brief)
- [环境变量](/reference/environment-variables)
- 维护与设计说明：[docs/development/agent-skill.md](https://github.com/HelTi/daily-hot-api/blob/main/docs/development/agent-skill.md)
