# 故障排查

## 先跑 doctor

```bash
node scripts/daily-hot.mjs doctor
```

`status` 取值：

- `ok`：Node 版本满足、找到可用实例、Mongo 已连接（或实例无需 Mongo 的实时能力可用）。
- `degraded`：能工作但有限制（例如 Mongo 未连接、只有实时热榜可用）。
- `blocked`：前置条件不满足（通常是 Node 版本过低），按 `suggestions` 修复。

## 常见问题

### Node 版本不满足

```text
需要 Node.js >= 22.20（当前 20.x）
```

- skill 需要 Node >= 22.20，推荐 24 LTS。
- 安装新 Node 后确认 `node -v`；nvm 用户可 `nvm install 24 && nvm use 24`。
- 注意：`daily-hot-api` 包的 `engines` 声明 `>=24`。Node 22.20–23.x 只有引擎警告、不阻断 npm 安装；skill 在 22.23.2 实测通过，但不在官方声明范围内。

### 首次 ensure 很慢或失败

- 首次会通过 `npx --yes @ttkit/daily-hot-api@0.1.5` 下载 CLI（约 1 MB，通常 5–20 秒）。
- 网络受限/国内网络可先配置镜像再重试：

```bash
npm config set registry https://registry.npmmirror.com
```

- 也可以全局安装：`npm i -g @ttkit/daily-hot-api@0.1.5`，skill 会优先使用 PATH 中的 CLI。
- 报 `notarget`（找不到该版本）：配了 npm 镜像且镜像还没同步这个版本。等几十分钟，或临时直连官方源：

```bash
npm_config_registry=https://registry.npmjs.org/ node scripts/daily-hot.mjs ensure
```
- 报错会带 CLI 输出的尾部；如果出现 `npm ERR!`，先手动执行一次上面的 npx 命令复现。

### 端口被占用

- 脚本优先用 6689；被占用时自动换空闲端口，不需要手动处理。
- 用户自己的实例跑在自定义端口时，设置 `DAILY_HOT_API_LOCAL_PORT=<端口>` 让 skill 自动发现（比 `DAILY_HOT_API_BASE_URL` 少写协议/主机）。
- 如果启动仍失败，`ensure` 的输出里会有 `logFile` 路径，查看日志尾部。
- 用户自己启动的实例占用默认端口时，skill 会直接复用（只读），不会另起实例。

### 服务启动了但 /health 不可达

- 看 `~/.daily-hot-api-skill/logs/daily-hot-api.log`。
- 常见原因：Node 版本、npm 包不完整、配置校验失败、端口权限。
- 启动标记在进程起来后就会写入，所以这种实例仍然可以用 `stop` 停掉：

```bash
node scripts/daily-hot.mjs stop
node scripts/daily-hot.mjs ensure
```

- 下一次 `ensure` 也会先停掉这个不健康的旧实例，不会越积越多。
- 实在要手动清理：`rm -rf ~/.daily-hot-api-skill` 之前先确认进程已退出（`daily-hot-api status --home ~/.daily-hot-api-skill`），否则会留下无人管理的进程。

### `/ready` 非 200 / history 500 / brief 500

- MongoDB 未连接。隔离实例故意不连 Mongo，因此这是预期行为。
- 实时热榜仍可用；历史与简报请连接一个配置了 `MONGODB_URI` 的自建实例：

```bash
export DAILY_HOT_API_BASE_URL=http://127.0.0.1:6689
```

- 详见 [history.md](history.md) 与 [daily-brief.md](daily-brief.md)。

### `hot` 返回 404

- source ID 不存在或拼错。先运行 `node scripts/daily-hot.mjs sources`。
- 来源可能依赖特定参数，见 [sources.md](sources.md)。

### 上游来源失败 / 超时

- 单个来源临时不可用时，换同类来源，或稍后重试一次。
- 默认走缓存；不要连续 `--no-cache` 刷同一来源，可能触发上游风控。
- 返回 400 时检查 `--param` 的 key 是否在服务端白名单内。

### `stop` 没有停止服务

- `stop` 只停止带本 skill 启动标记的实例；用户自己启动的实例不会被停止，这是设计行为。
- 状态目录由 `DAILY_HOT_API_SKILL_HOME` 决定（默认 `~/.daily-hot-api-skill`）。如果设置过自定义目录，停止时要用同一个值。
- 需要强制清理时，用户可以自己执行 `daily-hot-api stop`（会操作默认状态目录）。

### `stop` 报「停止服务失败」（退出码 4）

- 实例可能还在运行，标记文件会**保留**，所以可以直接重试 `stop`。
- CLI 提示「PID 无法确认是 daily-hot-api 进程」时（PID 被复用），按它给的命令处理：

```bash
daily-hot-api stop --force --home ~/.daily-hot-api-skill
```

- 这一步会发 SIGKILL，必须由用户确认后执行，skill 自己不会加 `--force`。

### Windows

- 优先在 WSL 或 Git Bash 中运行。
- 原生 Windows 下脚本会通过 shell 调用 `npx.cmd`；路径含空格时可能失败，建议使用 WSL。
- 服务本身在 Windows 上的 `stop` 行为见项目 CLI 文档。

## 退出码速查

| 码 | 含义 | 处理 |
| --- | --- | --- |
| 0 | 成功 | — |
| 2 | 用法错误 / 4xx | 修正参数；先 `sources` |
| 3 | 前置条件不满足 | 升级 Node、修复 CLI/启动问题 |
| 4 | 服务/上游失败 | 重试一次；检查网络、日志（`stop` 失败时标记保留，可直接重试） |
| 5 | 服务未运行 | `ensure` 或设置 `DAILY_HOT_API_BASE_URL` |

## 相关文档

- [API 契约](api.md)
- [来源清单](sources.md)
- [项目文档](https://helti.github.io/daily-hot-api/)
- [CLI 文档](https://helti.github.io/daily-hot-api/guide/cli)
