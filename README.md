# daily-hot-api

一个基于 NestJS 的每日热榜聚合 API 服务，支持多个平台的热榜数据获取，支持手动部署，pm2部署、docker部署，支持定时保存热点数据与备份数据，支持查询历史热点数据。



## 功能特性

- 🔥 支持多平台热榜数据聚合（知乎、bilibili、百度、豆瓣、稀土掘金等）
- 🚀 基于 Redis 的高效缓存机制
- 📊 历史热点数据存储和查询功能
- ⏰ 定时自动抓取热点数据，历史数据定时备份
- 🔍 支持全文搜索和高级查询
- 🎯 基于 URL 的数据去重机制

## 支持的站点

| 图标 | 站点名称 | 数据源 ID |
|:----:|----------|-----------|
| <img src="https://www.google.com/s2/favicons?domain=zhihu.com&sz=32" width="20" height="20" /> | 知乎 | `zhihu` |
| <img src="https://www.google.com/s2/favicons?domain=daily.zhihu.com&sz=32" width="20" height="20" /> | 知乎日报 | `zhihu-daily` |
| <img src="https://www.google.com/s2/favicons?domain=baidu.com&sz=32" width="20" height="20" /> | 百度 | `baidu` |
| <img src="https://www.google.com/s2/favicons?domain=bilibili.com&sz=32" width="20" height="20" /> | 哔哩哔哩 | `bilibili` |
| <img src="https://www.google.com/s2/favicons?domain=github.com&sz=32" width="20" height="20" /> | GitHub | `github` |
| <img src="https://www.google.com/s2/favicons?domain=juejin.cn&sz=32" width="20" height="20" /> | 掘金 | `juejin` |
| <img src="https://www.google.com/s2/favicons?domain=36kr.com&sz=32" width="20" height="20" /> | 36氪 | `36kr` |
| <img src="https://www.google.com/s2/favicons?domain=51cto.com&sz=32" width="20" height="20" /> | 51CTO | `51cto` |
| <img src="https://www.google.com/s2/favicons?domain=52pojie.cn&sz=32" width="20" height="20" /> | 吾爱破解 | `52pojie` |
| <img src="https://www.google.com/s2/favicons?domain=acfun.cn&sz=32" width="20" height="20" /> | AcFun | `acfun` |
| <img src="https://www.google.com/s2/favicons?domain=caixin.com&sz=32" width="20" height="20" /> | 财新网 | `caixin` |
| <img src="https://www.google.com/s2/favicons?domain=cls.cn&sz=32" width="20" height="20" /> | 财联社 | `cls` |
| <img src="https://www.google.com/s2/favicons?domain=coolapk.com&sz=32" width="20" height="20" /> | 酷安 | `coolapk` |
| <img src="https://www.google.com/s2/favicons?domain=csdn.net&sz=32" width="20" height="20" /> | CSDN | `csdn` |
| <img src="https://www.google.com/s2/favicons?domain=dgtle.com&sz=32" width="20" height="20" /> | 数字尾巴 | `dgtle` |
| <img src="https://www.google.com/s2/favicons?domain=douban.com&sz=32" width="20" height="20" /> | 豆瓣讨论 | `douban-group` |
| <img src="https://www.google.com/s2/favicons?domain=douban.com&sz=32" width="20" height="20" /> | 豆瓣电影 | `douban-movie` |
| <img src="https://www.google.com/s2/favicons?domain=douyin.com&sz=32" width="20" height="20" /> | 抖音 | `douyin` |
| <img src="https://www.google.com/s2/favicons?domain=geekpark.net&sz=32" width="20" height="20" /> | 极客公园 | `geekpark` |
| <img src="https://www.google.com/s2/favicons?domain=guokr.com&sz=32" width="20" height="20" /> | 果壳 | `guokr` |
| <img src="https://www.google.com/s2/favicons?domain=news.ycombinator.com&sz=32" width="20" height="20" /> | Hacker News | `hackernews` |
| <img src="https://www.google.com/s2/favicons?domain=hellogithub.com&sz=32" width="20" height="20" /> | HelloGitHub | `hellogithub` |
| <img src="https://www.google.com/s2/favicons?domain=baike.baidu.com&sz=32" width="20" height="20" /> | 历史上的今天 | `history` |
| <img src="https://www.google.com/s2/favicons?domain=miyoushe.com&sz=32" width="20" height="20" /> | 崩坏3 | `honkai` |
| <img src="https://www.google.com/s2/favicons?domain=hostloc.com&sz=32" width="20" height="20" /> | 全球主机交流论坛 | `hostloc` |
| <img src="https://www.google.com/s2/favicons?domain=hupu.com&sz=32" width="20" height="20" /> | 虎扑 | `hupu` |
| <img src="https://www.google.com/s2/favicons?domain=huxiu.com&sz=32" width="20" height="20" /> | 虎嗅 | `huxiu` |
| <img src="https://www.google.com/s2/favicons?domain=ifanr.com&sz=32" width="20" height="20" /> | 爱范儿 | `ifanr` |
| <img src="https://www.google.com/s2/favicons?domain=ithome.com&sz=32" width="20" height="20" /> | IT之家 | `ithome` |
| <img src="https://www.google.com/s2/favicons?domain=ithome.com&sz=32" width="20" height="20" /> | IT之家「喜加一」 | `ithome-xijiayi` |
| <img src="https://www.google.com/s2/favicons?domain=jianshu.com&sz=32" width="20" height="20" /> | 简书 | `jianshu` |
| <img src="https://www.google.com/s2/favicons?domain=jin10.com&sz=32" width="20" height="20" /> | 金十数据 | `jin10` |
| <img src="https://www.google.com/s2/favicons?domain=kuaishou.com&sz=32" width="20" height="20" /> | 快手 | `kuaishou` |
| <img src="https://www.google.com/s2/favicons?domain=linux.do&sz=32" width="20" height="20" /> | Linux.do | `linuxdo` |
| <img src="https://www.google.com/s2/favicons?domain=lol.qq.com&sz=32" width="20" height="20" /> | 英雄联盟 | `lol` |
| <img src="https://www.google.com/s2/favicons?domain=miyoushe.com&sz=32" width="20" height="20" /> | 米游社 | `miyoushe` |
| <img src="https://www.google.com/s2/favicons?domain=163.com&sz=32" width="20" height="20" /> | 网易新闻 | `netease-news` |
| <img src="https://www.google.com/s2/favicons?domain=ngabbs.com&sz=32" width="20" height="20" /> | NGA | `ngabbs` |
| <img src="https://www.google.com/s2/favicons?domain=nodeseek.com&sz=32" width="20" height="20" /> | NodeSeek | `nodeseek` |
| <img src="https://www.google.com/s2/favicons?domain=nytimes.com&sz=32" width="20" height="20" /> | 纽约时报 | `nytimes` |
| <img src="https://www.google.com/s2/favicons?domain=producthunt.com&sz=32" width="20" height="20" /> | Product Hunt | `producthunt` |
| <img src="https://www.google.com/s2/favicons?domain=qq.com&sz=32" width="20" height="20" /> | 腾讯新闻 | `qq-news` |
| <img src="https://www.google.com/s2/favicons?domain=sina.cn&sz=32" width="20" height="20" /> | 新浪网 | `sina` |
| <img src="https://www.google.com/s2/favicons?domain=sina.cn&sz=32" width="20" height="20" /> | 新浪新闻 | `sina-news` |
| <img src="https://www.google.com/s2/favicons?domain=smzdm.com&sz=32" width="20" height="20" /> | 什么值得买 | `smzdm` |
| <img src="https://www.google.com/s2/favicons?domain=sspai.com&sz=32" width="20" height="20" /> | 少数派 | `sspai` |
| <img src="https://www.google.com/s2/favicons?domain=miyoushe.com&sz=32" width="20" height="20" /> | 崩坏：星穹铁道 | `starrail` |
| <img src="https://www.google.com/s2/favicons?domain=thepaper.cn&sz=32" width="20" height="20" /> | 澎湃新闻 | `thepaper` |
| <img src="https://www.google.com/s2/favicons?domain=tieba.baidu.com&sz=32" width="20" height="20" /> | 百度贴吧 | `tieba` |
| <img src="https://www.google.com/s2/favicons?domain=toutiao.com&sz=32" width="20" height="20" /> | 今日头条 | `toutiao` |
| <img src="https://www.google.com/s2/favicons?domain=v2ex.com&sz=32" width="20" height="20" /> | V2EX | `v2ex` |
| <img src="https://www.google.com/s2/favicons?domain=wallstreetcn.com&sz=32" width="20" height="20" /> | 华尔街见闻 | `wallstreet` |
| <img src="https://www.google.com/s2/favicons?domain=nmc.cn&sz=32" width="20" height="20" /> | 中央气象台 | `weatheralarm` |
| <img src="https://www.google.com/s2/favicons?domain=weibo.com&sz=32" width="20" height="20" /> | 微博 | `weibo` |
| <img src="https://www.google.com/s2/favicons?domain=weread.qq.com&sz=32" width="20" height="20" /> | 微信读书 | `weread` |
| <img src="https://www.google.com/s2/favicons?domain=yicai.com&sz=32" width="20" height="20" /> | 第一财经 | `yicai` |
| <img src="https://www.google.com/s2/favicons?domain=yystv.cn&sz=32" width="20" height="20" /> | 游研社 | `yystv` |


## 技术栈
- **框架**: NestJS
- **缓存**: Redis (可选)
- **数据库**: MongoDB (可选)
- **语言**: TypeScript

## 本地运行
安装 node 版本 >= 20，推荐安装 redis 和 MongoDB，redis 用于查询缓存，如果没有redis 将使用内存缓存，MongoDB用于保存历史数据，可选。
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

热点类型：
- `type`: 具体的热点类型（可选）

示例：/hot-lists/juejin?type=1

### 查看所有接口

```
GET /hot-lists/all
```

## 历史数据功能

### 历史数据查询

```
GET /api/history/search?source=zhihu&keyword=AI&page=1&limit=10
```

### 定时任务管理

```
GET /api/scheduler/status
POST /api/scheduler/trigger
```

详细的历史功能使用说明请参考：[HISTORY_FEATURE.md](./HISTORY_FEATURE.md)、[DYNAMIC_SCHEDULER.md](./DYNAMIC_SCHEDULER.md)

## 开发指南

### 添加新的热榜数据源
数据源使用 DiscoveryModule 实现动态注册服务功能。

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
然后在 **hot-lists.module.ts** 中引入该源。

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
docker pull ttkit/daily-hot-api:latest
# 或者使用github的镜像源拉取镜像
docker pull ghcr.io/helti/daily-hot-api:latest
# 运行
docker run --restart always -p 6688:6688 -d ttkit/daily-hot-api:latest
```



### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `6689` |
| `REDIS_HOST` | Redis 主机 | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `REDIS_PASSWORD` | Redis 密码 | `` |
| `CACHE_TTL` | 缓存过期时间（秒） | `3600` |
| `MONGODB_URI` | MongoDB 连接字符串 | `` |
| `SCHEDULER_AUTO_START` | 是否自动启动定时抓取任务 | `false` |
| `SCHEDULER_CRON_EXPRESSION` | 定时抓取任务 Cron 表达式 | `0 */12 * * *` |
| `BACKUP_CRON_EXPRESSION` | 定时备份任务 Cron 表达式 | `0 1 * * *` |

更多配置查看 .env.example

### TODO：失效接口改造

以下数据源接口目前可能失效，待改造修复。完成后可将对应行的 `[ ]` 勾选为 `[x]`。

| 状态 | 图标 | 站点名称 | 数据源 ID |
|:----:|:----:|----------|-----------|
| [ ] | <img src="https://www.google.com/s2/favicons?domain=nodeseek.com&sz=32" width="20" height="20" /> | NodeSeek | `nodeseek` |
| [ ] | <img src="https://www.google.com/s2/favicons?domain=nytimes.com&sz=32" width="20" height="20" /> | 纽约时报 | `nytimes` |
| [ ] | <img src="https://www.google.com/s2/favicons?domain=linux.do&sz=32" width="20" height="20" /> | Linux.do | `linuxdo` |
| [ ] | <img src="https://www.google.com/s2/favicons?domain=producthunt.com&sz=32" width="20" height="20" /> | Product Hunt | `producthunt` |

## 📢 免责声明

- 本项目提供的 `API` 仅供开发者进行技术研究和开发测试使用。使用该 `API` 获取的信息仅供参考，不代表本项目对信息的准确性、可靠性、合法性、完整性作出任何承诺或保证。本项目不对任何因使用该 `API` 获取信息而导致的任何直接或间接损失负责。本项目保留随时更改 `API` 接口地址、接口协议、接口参数及其他相关内容的权利。本项目对使用者使用 `API` 的行为不承担任何直接或间接的法律责任
- 本项目并未与相关信息提供方建立任何关联或合作关系，获取的信息均来自公开渠道，如因使用该 `API` 获取信息而产生的任何法律责任，由使用者自行承担
- 本项目对使用 `API` 获取的信息进行了最大限度的筛选和整理，但不保证信息的准确性和完整性。使用 `API` 获取信息时，请务必自行核实信息的真实性和可靠性，谨慎处理相关事项
- 本项目保留对 `API` 的随时更改、停用、限制使用等措施的权利。任何因使用本 `API` 产生的损失，本项目不负担任何赔偿和责任

## 😘 鸣谢
部分数据源来自 https://github.com/imsyy/DailyHotApi 。

## 许可证

MIT
