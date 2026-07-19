# 获取热榜

所有热榜来源通过同一组接口访问。服务启动时会自动发现已注册的数据源。

## 查看可用来源

```http
GET /hot-lists/all
```

```bash
curl http://localhost:6688/hot-lists/all
```

响应中的 `name` 是后续请求使用的来源 ID：

```json
{
  "code": 200,
  "count": 2,
  "routes": [
    { "name": "zhihu", "title": "知乎", "path": "/zhihu" },
    { "name": "bilibili", "title": "哔哩哔哩", "path": "/bilibili" }
  ]
}
```

## 获取指定来源

```http
GET /hot-lists/:source
```

```bash
curl 'http://localhost:6688/hot-lists/zhihu?limit=10'
```

通用查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `limit` | string/number | 限制返回条数 |
| `noCache` | boolean | 为 `true` 时请求刷新数据；受 `NOT_ALLOWED_REFRESH_SOURCE` 限制 |
| `rss` | boolean | 为 `true` 时返回 RSS XML |
| `type` | string | 部分来源支持的榜单类别 |

不同来源还可能声明额外参数，可查看响应中的 `params` 字段。

典型 JSON 响应：

```json
{
  "code": 200,
  "name": "zhihu",
  "title": "知乎",
  "type": "热榜",
  "total": 10,
  "fromCache": true,
  "updateTime": "2026-07-19T06:00:00.000Z",
  "data": [
    {
      "id": "123",
      "title": "热点标题",
      "desc": "可选摘要",
      "hot": 123456,
      "url": "https://example.com/item/123",
      "mobileUrl": "https://example.com/item/123"
    }
  ]
}
```

## RSS 输出

单次请求 RSS：

```bash
curl 'http://localhost:6688/hot-lists/zhihu?rss=true'
```

也可以设置 `RSS_MODE=true`，让所有热榜请求默认返回 RSS。RSS 响应的 `Content-Type` 为 `application/xml; charset=utf-8`。

## 缓存行为

来源实现可以使用 Redis/内存缓存降低上游请求频率。请求 `noCache=true` 会尝试绕过缓存，但以下来源不会允许客户端强制刷新：

```dotenv
NOT_ALLOWED_REFRESH_SOURCE=github,bilibili
```

即使上游请求失败，统一服务通常也会返回空 `data` 和错误 `message`，避免单个来源故障影响其他接口。调用方应同时检查 `data`、`total` 和可选的 `message` 字段。
