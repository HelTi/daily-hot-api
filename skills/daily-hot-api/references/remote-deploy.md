# 连接自建 / 远程实例

当用户已经部署了 daily-hot-api（或希望用带 MongoDB、AI Key 的实例）时，让 skill 连接它，而不是启动隔离实例。

## 方式一：环境变量（推荐）

```bash
export DAILY_HOT_API_BASE_URL=http://127.0.0.1:6689
node scripts/daily-hot.mjs doctor
node scripts/daily-hot.mjs hot zhihu
```

地址支持 `http://` 与 `https://`；末尾斜杠会被忽略。设置后，所有命令都只读该实例，`stop` 不会停止它。

## 方式二：单次 `--base-url`

```bash
node scripts/daily-hot.mjs sources --base-url https://hot.example.com
```

适合临时连一台机器，不影响后续命令。

## 用 CLI 部署一个实例

```bash
# 准备配置（需要 Node >= 22.20，CLI 包声明 >=24）
mkdir -p ~/daily-hot-api-run && cd ~/daily-hot-api-run
cp "$(npm root -g)/@ttkit/daily-hot-api/.env.example" .env 2>/dev/null || \
  curl -fsSL https://raw.githubusercontent.com/HelTi/daily-hot-api/main/.env.example -o .env

# 至少配置 PORT、MONGODB_URI；需要简报时再加 AI Key
vi .env

daily-hot-api start -d
curl http://127.0.0.1:6689/health
```

如果不想全局安装，可用 `npx @ttkit/daily-hot-api start -d`（注意 npx 参数形式，长期使用建议全局安装）。

## 用 Docker 部署

```bash
docker network create hot-api-net
docker run -d --name redis --network hot-api-net redis:7-alpine
docker run -d --name mongodb --network hot-api-net mongo:6.0
docker run -d --name daily-hot-api \
  --network hot-api-net -p 6689:6689 \
  -e REDIS_HOST=redis -e REDIS_PORT=6379 \
  -e MONGODB_URI=mongodb://mongodb:27017/daily-hot-api \
  -e BRIEF_ENABLED=false \
  ttkit/daily-hot-api:latest
```

镜像内置 `NODE_ENV=production`，必须提供 `MONGODB_URI`。详见
[Docker 部署文档](https://helti.github.io/daily-hot-api/operations/docker)。

## 远程访问注意事项

- 服务本身**没有鉴权**，直接暴露公网等于允许任何人读取热榜、历史，甚至触发简报生成/删除。
- 如果必须远程访问，放在带认证的反向代理/网关后（Nginx Basic Auth、Cloudflare Access、内网 VPN 等），并限制 `POST` / `DELETE` 路由。
- `ALLOWED_DOMAIN` 只控制 CORS，不提供访问控制。
- skill 连接远程实例时默认只读；用户明确要求生成简报时，应由用户自己触发或授权。

## 验证

```bash
node scripts/daily-hot.mjs doctor --base-url https://hot.example.com
node scripts/daily-hot.mjs brief latest --base-url https://hot.example.com
```

`doctor` 中 `ready.ready=true` 表示 Mongo 已连接，历史与简报可用；否则只有实时热榜可用。
