# 命令行工具（CLI）

npm 包 `@ttkit/daily-hot-api` 提供一个命令名为 `daily-hot-api` 的 CLI，可以在任意目录启动热点聚合服务，并用命令停止、重启、查看状态和日志。适合本机开发、单机部署和快速验证；生产部署仍推荐 [PM2](/operations/pm2) 或 [Docker](/operations/docker)（注意调度器是进程内实现，多实例部署需先解决调度与锁问题）。

## 环境要求

- Node.js 24 或更高版本（CLI 直接复用已构建的 `dist` 产物）
- 服务依赖的 MongoDB / Redis 配置，见[环境变量参考](/reference/environment-variables)

## 安装

包已发布到 npm：**包名 `@ttkit/daily-hot-api`，命令名 `daily-hot-api`**。

```bash
# 全局安装（推荐，之后可直接运行 daily-hot-api）
npm install -g @ttkit/daily-hot-api

# 检查安装
daily-hot-api --version
daily-hot-api --help
```

不想全局安装时可以用 `npx`：

```bash
npx @ttkit/daily-hot-api --help
```

::: tip
`npx` 每次可能重新解析并临时安装包，长期使用建议 `npm install -g`。安装后命令名是 `daily-hot-api`（不是包名）。
:::

## 准备配置

CLI 会按下面的顺序读取 `.env` 配置文件，先找到哪个就用哪个：

1. `--config <路径>`（推荐）
2. 环境变量 `DAILY_HOT_API_ENV_FILE`
3. 当前工作目录的 `.env`
4. 状态目录下的 `.env`（默认 `~/.daily-hot-api/.env`）

最常见的用法是在一个空目录里准备配置，然后从该目录启动：

```bash
mkdir -p ~/daily-hot-api-run && cd ~/daily-hot-api-run
cp "$(npm root -g)/@ttkit/daily-hot-api/.env.example" .env
# 按需修改 .env 中的 MONGODB_URI、REDIS_HOST、PORT 等
```

也可以把任意路径的配置文件传给 CLI：

```bash
daily-hot-api --config /etc/daily-hot-api/prod.env
```

端口优先级：`--port` > 配置文件/环境变量 `PORT` > `6689`。

::: warning 不要使用 `--env-file`
`--env-file` 是 Node.js 自身的命令行参数。Node 会抢先解析它，文件不存在时直接以退出码 9 失败，CLI 来不及给出友好提示。请统一使用 `--config`。
:::

## 启动服务

### 前台启动

在控制台直接运行 `daily-hot-api`（等价于 `daily-hot-api start`），日志输出到当前终端，`Ctrl+C` 停止：

```bash
# 使用当前目录的 .env，端口默认 6689
daily-hot-api

# 指定端口和配置文件
daily-hot-api -p 6699 --config ./prod.env
```

### 后台启动

加 `-d` / `--daemon`，命令会在确认端口监听且 `/health` 可访问后返回，服务继续在后台运行：

```bash
daily-hot-api start -d
daily-hot-api start -d --port 6699 --config ./prod.env
```

成功后输出后台进程 PID、日志文件位置和停止命令：

```text
[daily-hot-api] 热点服务已在后台启动: http://localhost:6699
  PID: 51234
  日志: /Users/you/.daily-hot-api/logs/daily-hot-api.log
```

后台启动最多等待 60 秒就绪；如果进程提前退出或超时，命令会打印日志尾部并以非 0 退出码结束，便于直接定位配置问题。

## 查看状态

```bash
daily-hot-api status
```

```text
[daily-hot-api] 热点服务运行中
  PID: 51234
  端口: 6699
  地址: http://localhost:6699
  模式: 后台 (daemon)
  启动时间: 2026-10-31T04:10:00.305Z（已运行 2 分钟）
  健康检查: ok
  配置文件: /Users/you/daily-hot-api-run/.env
  运行目录: /Users/you/daily-hot-api-run
  日志文件: /Users/you/.daily-hot-api/logs/daily-hot-api.log
```

脚本里可以加 `--json` 获取结构化输出：

```bash
daily-hot-api status --json
```

服务未运行时 `status` 以退出码 `3` 结束，方便在脚本里做判断。

## 停止服务

前台、后台启动的服务都可以从任意终端停止：

```bash
daily-hot-api stop
```

停止流程：读取状态目录里记录的 PID → 发送 `SIGTERM` 等待优雅退出（默认 10 秒）→ 超时后发送 `SIGKILL`。服务本来就没有运行时命令仍然返回 0（幂等），适合放进部署脚本。

```bash
# 自定义等待时间
daily-hot-api stop --timeout 20

# 跳过校验，立即 SIGKILL
daily-hot-api stop --force

# JSON 输出，方便脚本消费
daily-hot-api stop --json
```

停止前 CLI 会尽量用 `ps` 校验 PID 是否仍属于 `daily-hot-api`，避免系统复用 PID 后误杀其他进程。如果 PID 存活但无法确认属于本服务，CLI 会跳过停止并保留状态文件，此时可执行 `daily-hot-api stop --force` 强制终止并清理状态。在无法读取进程信息的环境（例如受限沙箱、部分 Windows 环境）会退化为按状态文件记录的 PID 执行。

## 重启服务

```bash
# 沿用上一次的端口、配置文件和运行模式
daily-hot-api restart

# 强制重启为后台模式
daily-hot-api restart -d

# 强制重启为前台模式（命令会占住当前终端）
daily-hot-api restart --foreground

# 同时换端口/配置文件
daily-hot-api restart -d --port 6699 --config ./prod.env
```

服务未在运行时，`restart` 等价于 `start`。

## 查看日志

后台模式的标准输出和错误都写入状态目录下的日志文件：

```bash
# 最后 50 行
daily-hot-api logs

# 最后 200 行
daily-hot-api logs -n 200

# 持续跟踪新增内容，Ctrl+C 退出
daily-hot-api logs -f
```

前台模式的日志直接打印在启动终端，不会写入日志文件。

## 状态目录

CLI 把运行状态和后台日志保存在状态目录，默认 `~/.daily-hot-api`：

```text
~/.daily-hot-api/
  daily-hot-api.json       # PID、端口、模式、启动时间等运行状态
  logs/
    daily-hot-api.log      # 后台模式日志
```

可以用 `DAILY_HOT_API_HOME` 环境变量或 `--home` 指定其他目录。需要同时运行多个实例时，用不同的 `--home` 和端口隔离：

```bash
daily-hot-api start -d -p 6699 --home ~/.daily-hot-api-6699
daily-hot-api start -d -p 6698 --home ~/.daily-hot-api-6698
daily-hot-api --home ~/.daily-hot-api-6699 status
```

## 命令与选项

| 命令 | 说明 |
| --- | --- |
| `daily-hot-api` / `daily-hot-api start` | 在前台启动服务 |
| `daily-hot-api start -d` | 在后台启动服务 |
| `daily-hot-api stop` | 停止服务 |
| `daily-hot-api status` | 查看服务状态；未运行退出码 3 |
| `daily-hot-api restart` | 重启服务 |
| `daily-hot-api logs [-f]` | 查看/跟踪后台日志 |
| `daily-hot-api help [命令]` | 查看帮助 |
| `daily-hot-api --version` | 查看版本 |

| 选项 | 适用命令 | 说明 |
| --- | --- | --- |
| `-p, --port <端口>` | start / restart | 覆盖监听端口 |
| `-d, --daemon` | start / restart | 后台运行 |
| `--foreground` | restart | 重启为前台模式 |
| `--config <路径>` | start / restart | 指定 `.env` 配置文件 |
| `--home <目录>` | start / stop / status / restart / logs | 指定状态目录 |
| `--timeout <秒>` | stop / restart | 等待进程退出的超时，默认 10 |
| `--force` | stop / restart | 跳过 PID 校验并立即 SIGKILL |
| `--json` | status / stop | JSON 输出 |
| `-n, --lines <行数>` | logs | 显示最后 N 行，默认 50 |
| `-f, --follow` | logs | 持续跟踪日志 |
| `-h, --help` | 全部 | 查看帮助 |
| `-v, --version` | 全部 | 查看版本 |

## CLI 相关环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `6689` | 服务端口；CLI 和服务都会读取，用于启动前端口检查和实际监听 |
| `DAILY_HOT_API_HOME` | `~/.daily-hot-api` | 运行状态和日志目录 |
| `DAILY_HOT_API_ENV_FILE` | 空 | 显式指定 `.env` 文件，等价于 `--config` |

服务本身的环境变量（Redis、MongoDB、简报、AI 等）见[环境变量参考](/reference/environment-variables)。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功；`stop` 时服务本来未运行也算成功 |
| `1` | 运行错误：配置错误、启动失败、停止失败等 |
| `2` | 参数或用法错误 |
| `3` | `status` 专用：服务未在运行 |

前台模式被 `SIGTERM`（`kill` 默认）或 `SIGINT`（`Ctrl+C`）中断时，进程会按 shell 惯例以 `143` 或 `130` 退出——这是 Nest 执行完优雅关闭钩子后重新抛出信号的行为，状态文件会正常清理。`kill -9` 不会执行清理，但下次 `status`/`start`/`stop` 会自动识别并清理过期状态文件。脚本里判断服务是否在运行请使用 `status` 的退出码，不要把 130/143 当成启动失败。

## 与 PM2 / Docker 的关系

CLI 管理的是自己启动的进程（通过状态目录里的 PID），不会接管 PM2 或 Docker 里的实例：

- 用 PM2 部署时继续使用 `pm2 start ecosystem.config.cjs`，不要再用 `daily-hot-api start` 启动同一端口。
- Docker 部署使用容器自身的重启策略和 `docker stop`。
- CLI 的 `stop` 找不到状态文件时会提示「未在运行」，不会误杀其他部署方式启动的服务。

## 发布到 npm（维护者）

当前已经以 `0.1.2` 发布。发布新版本前先更新版本号，并合并到 `main`：

```bash
npm version patch|minor|major --no-git-tag-version
```

### 推荐：Trusted Publishing（OIDC，不需要 token）

仓库提供 `.github/workflows/publish.yml`，通过 GitHub Actions OIDC 发布，npm 会自动生成 provenance，不需要保存 `NPM_TOKEN`。

在包的设置页 [Trusted Publisher](https://www.npmjs.com/package/@ttkit/daily-hot-api/access) 按下面填写：

| 字段 | 值 |
| --- | --- |
| Publisher | GitHub Actions |
| Label | 可留空，或填 `release` |
| Organization or user | `HelTi` |
| Repository | `daily-hot-api` |
| Workflow filename | `publish.yml` |
| Environment name | 留空 |
| Allowed actions | 勾选 **`npm publish`**（`npm stage publish` 默认允许） |

保存后，发布新版本有两种方式：

1. 在 GitHub 创建 Release（发布 tag，例如 `v0.1.2`），触发 `Publish to npm` workflow；
2. 在 GitHub Actions 页面手动运行 `Publish to npm`（`workflow_dispatch`）。

workflow 依次执行 `npm ci` → `npm run build` → `npm test` → `npm publish --access public`。发布前请确认 `main` 上 `package.json` 的版本已更新，且与 Release tag 对应。

### 备选：本地 token 发布

1. 本地验证：先 `npm run build`，再 `npm run pack:check`（`pack:check` 只打包现有 `dist`，不会自动构建），确认 tarball 只包含 `bin/`、`dist/`、`views/`、`.env.example` 和自动附带的 `package.json` / `README.md` / `LICENSE`，不包含 `.env`、`docs/.vitepress` 缓存或测试文件。
2. 登录并发布：

```bash
npm login
npm publish --access public
```

`prepublishOnly` 会自动执行 `npm run build`；`publishConfig.access` 为 `public`，`publishConfig.registry` 指向 `https://registry.npmjs.org/`，因此即使本机 registry 配置为镜像（例如 npmmirror），`npm publish` 也会发布到 npmjs。配置 Trusted Publisher 后仍然可以用 token 手动发布。

::: tip 为什么用 @ttkit scope
非 scoped 的 `daily-hot-api` 与 npm 上已有的 `dailyhotapi` 太相似，npm 不允许注册；因此使用 `@ttkit/daily-hot-api`，而终端命令保持 `daily-hot-api`。如果 npm 将新版本放入 staged 队列，需要维护者在 npmjs.com 的 **Staged Packages** 页面用 2FA 审批后版本才会真正可安装。
:::

发布后验证：

```bash
npx -y @ttkit/daily-hot-api@latest --version
```

## 故障排查

| 现象 | 排查方式 |
| --- | --- |
| `端口 X 已被其他进程占用` | 换 `--port`，或先执行 `daily-hot-api stop` / 找到占用进程 |
| 启动失败并提示配置校验失败 | 检查 `.env` 或 `--config` 文件；`NODE_ENV=production` 时必须设置 `MONGODB_URI` |
| 后台启动 60 秒后超时 | 先 `daily-hot-api logs -n 100` 查看配置校验 / bootstrap / 端口错误；MongoDB、Redis 故障通常只导致接口降级，不会阻止就绪 |
| `status` 返回 3 | 服务未运行，或使用了不同的 `--home` 状态目录 |
| 停止后 PID 仍存在 | 加 `--force`；或手动 `kill -9 <pid>` 后删除 `<home>/daily-hot-api.json` |
| 前台模式看不到日志文件 | 前台日志输出到终端属于预期行为；需要日志文件请用 `start -d` |

## Windows 说明

- `stop` 在 Windows 上通过 Node 的 `process.kill` 实现，`SIGTERM` 会被映射为强制终止，服务可能来不及执行优雅关闭流程。状态文件会在下次 `status`/`start` 时检测到过期 PID 并自动清理。
- Windows 没有 `ps` 命令，PID 校验会退化为「只检查进程是否存在」，`status` 同样无法区分 PID 复用。如果状态文件已过期且 PID 恰好被系统复用，`status` 可能误报运行中，`stop` 也可能向无关进程发送信号。操作前建议核对 `<home>/daily-hot-api.json` 里的 PID、端口与任务管理器/`tasklist` 中的实际进程是否一致，或用 `--home` 隔离状态目录。
