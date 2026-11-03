# 热榜来源清单

来源由服务启动时自动发现并注册，**以 `GET /hot-lists/all` 的实时结果为准**。本文件用于快速查找 source ID 和来源专属参数，数量/名称可能随版本变化。

## 综合 / 热榜 / 社区

| source | 名称 | 类型 |
| --- | --- | --- |
| `zhihu` | 知乎 | 热榜 |
| `zhihu-daily` | 知乎日报 | 推荐榜 |
| `weibo` | 微博 | 热搜榜 |
| `baidu` | 百度 | 热榜 |
| `douyin` | 抖音 | 热榜 |
| `toutiao` | 今日头条 | 热榜 |
| `qq-news` | 腾讯新闻 | 热点榜 |
| `netease-news` | 网易新闻 | 热点榜 |
| `sina` | 新浪网 | 热榜 |
| `sina-news` | 新浪新闻 | 榜单 |
| `thepaper` | 澎湃新闻 | 热榜 |
| `tieba` | 百度贴吧 | 热议榜 |
| `hupu` | 虎扑 | 步行街热帖 |
| `ngabbs` | NGA | 论坛热帖 |
| `v2ex` | V2EX | 主题榜 |
| `hostloc` | 全球主机交流论坛 | 最新动态 |
| `nodeseek` | NodeSeek | 最新 |
| `linuxdo` | Linux.do | 热门文章 |
| `52pojie` | 吾爱破解 | 热榜 |
| `coolapk` | 酷安 | 热榜 |
| `acfun` | AcFun | 排行榜 |
| `kuaishou` | 快手 | 热榜 |
| `lol` | 英雄联盟 | 更新公告 |
| `bilibili` | 哔哩哔哩 | 热榜 |

## 科技 / 开发者 / 产品

| source | 名称 | 类型 |
| --- | --- | --- |
| `36kr` | 36氪 | 热榜 |
| `51cto` | 51CTO | 热榜 |
| `csdn` | CSDN | 排行榜 |
| `juejin` | 掘金 | 热榜 |
| `github` | GitHub | 趋势 |
| `hellogithub` | HelloGitHub | 热门仓库 |
| `hackernews` | Hacker News | Popular |
| `producthunt` | Product Hunt | Today |
| `sspai` | 少数派 | 热榜 |
| `ifanr` | 爱范儿 | 快讯 |
| `ithome` | IT之家 | 热榜 |
| `ithome-xijiayi` | IT之家「喜加一」 | 最新动态 |
| `geekpark` | 极客公园 | 热门文章 |
| `huxiu` | 虎嗅 | 24小时 |
| `dgtle` | 数字尾巴 | 热门文章 |
| `jianshu` | 简书 | 热门推荐 |
| `guokr` | 果壳 | 热门文章 |
| `xinyu` | 芯语 | 最新 |

## 财经 / 商业

| source | 名称 | 类型 |
| --- | --- | --- |
| `caixin` | 财新网 | 排行榜 |
| `cls` | 财联社 | 头条 |
| `eastmoney` | 东方财富 | 热点 |
| `eastmoney-stock` | 东方财富热股排行 | 财经 |
| `gelonghui` | 格隆汇 | 财经 |
| `jin10` | 金十数据 | 推荐榜 |
| `tonghuashun` | 同花顺财经 | 财经 |
| `wallstreet` | 华尔街见闻 | 热门文章 |
| `yicai` | 第一财经 | 头条 |

## 娱乐 / 游戏 / 生活 / 消费

| source | 名称 | 类型 |
| --- | --- | --- |
| `douban-group` | 豆瓣讨论 | 讨论精选 |
| `douban-movie` | 豆瓣电影 | 新片榜 |
| `honkai` | 崩坏3 | 最新动态 |
| `starrail` | 崩坏：星穹铁道 | 最新动态 |
| `miyoushe` | 米游社 | 最新动态 |
| `yystv` | 游研社 | 全部文章 |
| `weread` | 微信读书 | 排行榜 |
| `jd` | 京东 | 热销总榜 |
| `taobao` | 淘宝 | 首页好货 |
| `smzdm` | 什么值得买 | 热门榜 |
| `history` | 历史上的今天 | 历史 |
| `weatheralarm` | 中央气象台 | 气象预警 |

## 国际

| source | 名称 | 类型 |
| --- | --- | --- |
| `nytimes` | 纽约时报 | 新闻 |

## 来源专属参数

通过 `hot <source> --param key=value` 传递（可重复）：

| source | 参数 | 示例 |
| --- | --- | --- |
| `nytimes` | `area`: `china`（中文网）/ `global`（全球版） | `--param area=global` |
| `history` | `month`、`day`（两位数字）或 `type=MM-DD` | `--param month=03 --param day=08` |
| `weatheralarm` | `province`，如 `北京`；留空为全国 | `--param province=北京` |
| `hupu` | `page`、`pageSize`、`cursor`；topicId 用专用选项 `--type` | `--param page=2 --param pageSize=10` |
| `miyoushe` | `game`：`1` 崩坏3、`2` 原神、`3` 崩坏学园2、`4` 未定事件簿、`6` 崩坏：星穹铁道、`8` 绝区零 | `--param game=2` |

未知参数会被服务端 400 拒绝；`--param` 不能覆盖 `limit` / `type` / `noCache` / `rss`（这些用专用选项）。
key 允许字母开头的字母、数字、`_`、`-`，大小写都可以，所以 `pageSize` 这类驼峰参数能直接传。

## 刷新限制

`.env` 的 `NOT_ALLOWED_REFRESH_SOURCE` 可禁止某些来源被手动刷新（例如 `github,bilibili`），此时 `--no-cache` 不生效，返回缓存数据。`IGNORE_SAVE_SOURCES` 中的来源仍可实时获取，只是不写入历史库。

## 常见推荐组合

- 综合热点：`zhihu` + `weibo` + `baidu` + `toutiao`
- 科技：`juejin` + `github` + `hackernews` + `36kr`
- 财经：`cls` + `caixin` + `wallstreet` + `jin10`
- 社区舆情：`v2ex` + `ngabbs` + `hostloc` + `linuxdo`

上游来源可能临时不可用，换同类来源即可；不要在同一来源上反复强制刷新。
