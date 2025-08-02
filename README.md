# Daily Hot API

一个基于 NestJS 的每日热榜聚合 API 服务，支持多个平台的热榜数据获取，支持本地部署，pm2部署、docker部署。

本项目由 [msyy/DailyHotApi](https://github.com/imsyy/DailyHotApi) 项目改造而来，原项目使用的hono框架，因为本人使用的nestjs较多，为了后面项目功能的扩展便改用了nestjs。

## 功能特性

- 🔥 支持多平台热榜数据聚合（知乎、bilibili、百度、豆瓣、稀土绝境等）
- 🚀 基于 Redis 的高效缓存机制

## 技术栈
- **框架**: NestJS
- **缓存**: Redis
- **语言**: TypeScript

## 本地运行

```bash
# clone项目
git clone https://github.com/HelTi/daily-hot-api.git
# 安装依赖
$ npm install

# 环境配置
# 复制并修改环境配置文件
$ cp .env.example .env
```

### 运行项目

```bash
# 开发模式
$ npm run dev

# 监听模式
$ npm run start:dev

# 生产模式
$ npm run start:prod
```

## API 接口

### 获取热榜列表

```
GET /hot-lists/{sourceName}
```

支持的数据源：
- `zhihu` - 知乎热榜

查询参数：
- `noCache`: 是否跳过缓存（可选）

### 查看所有接口

```
GET /hot-lists/all
```

## 开发指南

### 添加新的热榜数据源

1. 在 `src/host-lists/sources/` 目录下创建新的数据源文件
2. 实现 `HotListSource` 接口
3. 使用 `@HotSource` 装饰器注册数据源

示例：

```typescript
@Injectable()
@HotSource({
  name: 'sourceName',
  title: '示例热榜',
  type: '热榜',
  link: 'https://example.com',
})
export class ExampleSource implements HotListSource {
  async getList( options: GetListOptions = {},noCache?: boolean,): Promise<HotListGetListResponse[]> {
    // 实现获取数据的逻辑
  }
}
```

## 部署

### 本地部署
推荐使用 pm2 部署，脚本命令：
```sh
sh deploy-pm2.sh
```

### Docker 部署

```bash
# 构建镜像
$ docker build -t daily-hot-api .

# 运行容器
$ docker run -p 6688:6688 daily-hot-api
```
或者使用 make 命令：

```bash
$ make deploy
```

docker镜像部署：
```bash
# 拉取镜像
docker pull docker push ttkit/daily-hot-api:latest

# 运行
docker run --restart always -p 6688:6688 -d ttkit/daily-hot-api:latest
```



### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `6689` |
| `REDIS_HOST` | Redis 主机 | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `CACHE_TTL` | 缓存过期时间（秒） | `3600` |

### TODO，失效接口改造
nodeseek,nytimes,linuxdo,producthunt


## 📢 免责声明

- 本项目提供的 `API` 仅供开发者进行技术研究和开发测试使用。使用该 `API` 获取的信息仅供参考，不代表本项目对信息的准确性、可靠性、合法性、完整性作出任何承诺或保证。本项目不对任何因使用该 `API` 获取信息而导致的任何直接或间接损失负责。本项目保留随时更改 `API` 接口地址、接口协议、接口参数及其他相关内容的权利。本项目对使用者使用 `API` 的行为不承担任何直接或间接的法律责任
- 本项目并未与相关信息提供方建立任何关联或合作关系，获取的信息均来自公开渠道，如因使用该 `API` 获取信息而产生的任何法律责任，由使用者自行承担
- 本项目对使用 `API` 获取的信息进行了最大限度的筛选和整理，但不保证信息的准确性和完整性。使用 `API` 获取信息时，请务必自行核实信息的真实性和可靠性，谨慎处理相关事项
- 本项目保留对 `API` 的随时更改、停用、限制使用等措施的权利。任何因使用本 `API` 产生的损失，本项目不负担任何赔偿和责任

## 😘 鸣谢
本项目由 https://github.com/imsyy/DailyHotApi 改造而来。

## 许可证

MIT
