# 东方财富热股排行

## 功能概览

`eastmoney-stock` 源提供东方财富股吧热股人气排行。接口返回项目统一热榜结构，条目包含股票名称、代码、当前排名、现价、涨跌幅和排名变化摘要。

## 关键文件

```text
src/host-lists/sources/eastmoney-stock.source.ts
src/host-lists/hot-lists.module.ts
```

## 数据来源

排行数据来自东方财富 App 热股排行接口：

```text
https://emappdata.eastmoney.com/stockrank/getAllCurrentList
```

股票名称、价格和涨跌幅通过东方财富行情接口批量补齐：

```text
https://push2.eastmoney.com/api/qt/ulist.np/get
```

该源不需要登录、签名或新增环境变量。默认拉取前 100 条排行数据，`limit` 查询参数仍由通用热榜控制器负责裁剪返回数量。

## API

```bash
curl http://localhost:6688/hot-lists/eastmoney-stock
curl 'http://localhost:6688/hot-lists/eastmoney-stock?limit=20'
```

返回条目的 `url` 指向东方财富个股行情页，`mobileUrl` 指向东方财富移动端个股行情页。

## 验证

```bash
npm run build
npx eslint "src/**/*.ts"
```

运行服务后可验证：

```bash
curl http://localhost:6688/hot-lists/eastmoney-stock
```
