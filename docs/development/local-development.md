# 本地开发

## 准备环境

项目要求 Node.js 20 或更高版本。

```bash
npm install
cp .env.example .env
```

开发时建议关闭自动任务：

```dotenv
SCHEDULER_AUTO_START=false
BRIEF_ENABLED=false
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 监听源码并启动 NestJS |
| `npm run build` | 编译 TypeScript 到 `dist` |
| `npm run start:prod` | 运行已构建的生产代码 |
| `npx eslint "src/**/*.ts"` | 检查业务源码 |
| `npm test` | 运行 Jest 单元测试 |
| `npm run test:e2e` | 运行端到端测试 |
| `npm run docs:dev` | 启动 VitePress 文档开发服务 |
| `npm run docs:build` | 构建静态文档 |
| `npm run docs:preview` | 预览文档构建产物 |

仓库已有一个可能影响全量 `npm run lint` 的 e2e lint 问题。未修改测试时，优先使用源码范围的 ESLint 命令。

## 推荐验证顺序

修改服务源码后：

```bash
npm run build
npx eslint "src/**/*.ts"
```

修改文档后：

```bash
npm run docs:build
npm run docs:preview
```

修改路由或每日简报后，可在其他端口做临时验证，避免占用现有服务端口：

```bash
PORT=6699 BRIEF_ENABLED=false npm run start:prod
```

另一个终端执行：

```bash
curl http://localhost:6699/health
curl http://localhost:6699/api/briefs/config
```

## 代码组织约定

- 控制器负责 HTTP 参数和返回格式，业务逻辑放在 Service。
- MongoDB 操作放在 Repository，不要在控制器直接访问 Model。
- 新环境变量同步更新配置加载、配置校验、`.env.example` 和文档。
- 新功能应更新 `docs/` 中对应页面；没有合适页面时再创建聚焦的新文档。
- 前端接口默认不返回体积较大的调试字段。
- 不在日志、测试快照或文档中写入真实 API Key。

## 文档开发

VitePress 直接以 `docs/` 为内容根目录：

```bash
npm run docs:dev
```

导航和侧边栏配置位于 `docs/.vitepress/config.mts`。新增页面后应同时把它加入适当的侧边栏分组，并确保内部链接使用以 `/` 开头的文档路由。

GitHub Pages 项目地址使用子路径 `/daily-hot-api/`。不要删除 VitePress 的 `base` 配置，否则线上静态资源会出现 404。
