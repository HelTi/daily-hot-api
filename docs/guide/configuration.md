# 环境配置

服务通过根目录的 `.env` 读取运行配置。复制示例文件后再按环境修改：

```bash
cp .env.example .env
```

## 推荐的开发配置

```dotenv
PORT=6688
ALLOWED_DOMAIN=*
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
MONGODB_URI=mongodb://localhost:27017/daily-hot-api
SCHEDULER_AUTO_START=false
BRIEF_ENABLED=false
```

开发环境建议关闭两个自动调度器，避免调试时批量抓取外部来源或意外调用付费的搜索与模型接口。

## 推荐的生产配置

```dotenv
PORT=6688
ALLOWED_DOMAIN=https://your-frontend.example.com
REDIS_HOST=redis
REDIS_PORT=6379
MONGODB_URI=mongodb://mongodb:27017/daily-hot-api
SCHEDULER_AUTO_START=true
BRIEF_ENABLED=true
BRIEF_TIMEZONE=Asia/Shanghai
```

生产环境应另外配置真实的 `OPENAI_API_KEY` 和 `TAVILY_API_KEY`。不要把 `.env` 或密钥提交到 Git。

## 配置生效规则

- 修改 `.env` 后需要重启服务。
- `SCHEDULER_AUTO_START` 和 `BRIEF_ENABLED` 控制服务启动时是否自动注册任务。
- 通过 API 手动启停任务只影响当前进程；进程重启后会重新读取环境变量。
- `ALLOWED_DOMAIN` 用于 CORS 的 `origin`，公开 API 可使用 `*`，限定前端时填写完整 Origin。
- 被列入 `NOT_ALLOWED_REFRESH_SOURCE` 的来源会忽略客户端的 `noCache=true`。
- 被列入 `IGNORE_SAVE_SOURCES` 的来源仍可实时访问，但不会保存到历史数据库。

所有字段、默认值和用途见[环境变量参考](/reference/environment-variables)。
