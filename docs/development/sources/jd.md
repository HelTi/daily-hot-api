# 京东热销总榜

## 功能概览

`jd` 源提供京东首页官方曝光的排行榜与热销相关入口，作为“京东热销总榜”。每条记录来自京东首页静态 HTML 中的 `phb`、`jxinfo`、`zxnews` 等官方榜单/推荐链接，并返回项目统一的热榜结构。

## 关键文件

```text
src/host-lists/sources/jd.source.ts
src/host-lists/hot-lists.module.ts
```

## 数据来源

当前源抓取京东首页：

```text
https://www.jd.com/
```

京东搜索结果页和部分推荐 API 会触发验证或跨域来源校验，直接服务端接入稳定性较差。因此该源解析京东首页公开 HTML 中已经曝光的官方排行榜入口，不需要登录、签名或新增环境变量。

## API

```bash
curl http://localhost:6688/hot-lists/jd
```

返回条目的 `url` 指向京东官方排行榜/推荐页面，`mobileUrl` 指向对应标题的京东移动端销量排序搜索页。

## 验证

```bash
npm run build
npx eslint "src/**/*.ts"
```

运行服务后可验证：

```bash
curl http://localhost:6688/hot-lists/jd
```
