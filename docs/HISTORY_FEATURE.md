# 历史热点数据功能

## 功能概述

本功能为 daily-hot-api 项目添加了历史热点数据的存储和查询能力：

1. **定时抓取**: 自动定时抓取各个平台的热点数据并存储到 MongoDB
2. **数据去重**: 基于 URL 进行去重，避免重复存储相同内容
3. **历史查询**: 提供丰富的查询接口，支持搜索、分页、排序等功能
4. **任务管理**: 支持定时任务的启动、停止和配置管理

## 数据库配置

### MongoDB 连接

在环境变量中配置 MongoDB 连接：

```bash
MONGODB_URI=mongodb://localhost:27017/daily-hot-api
```

### 数据库集合

- `hot_items`: 存储热点数据
- `source_configs`: 存储数据源配置

## API 接口

### 历史数据查询

#### 搜索历史数据
```
GET /api/history/search
```

查询参数：
- `source`: 数据源名称（可选）
- `keyword`: 搜索关键词（可选）
- `startDate`: 开始日期，格式：YYYY-MM-DD（可选）
- `endDate`: 结束日期，格式：YYYY-MM-DD（可选）
- `page`: 页码，默认 1（可选）
- `limit`: 每页数量，默认 20，最大 100（可选）
- `sortBy`: 排序字段，可选值：timestamp, title, createdAt（可选）
- `sortOrder`: 排序方向，可选值：asc, desc（可选）

示例：
```bash
curl "http://localhost:6688/api/history/search?source=zhihu&keyword=AI&page=1&limit=10"
```

#### 获取数据源列表
```
GET /api/history/sources
```

#### 获取数据统计
```
GET /api/history/stats
```

#### 获取最新数据
```
GET /api/history/latest?source=zhihu&limit=20
```

#### 根据时间范围获取数据
```
GET /api/history/range/{source}/{startTime}/{endTime}
```

### 定时任务管理

#### 获取任务状态
```
GET /api/scheduler/status
```

#### 启动定时任务
```
POST /api/scheduler/start
```

#### 停止定时任务
```
POST /api/scheduler/stop
```

#### 手动触发数据抓取
```
POST /api/scheduler/trigger
```

请求体：
```json
{
  "source": "zhihu"  // 可选，不指定则抓取所有数据源
}
```

#### 获取数据源配置
```
GET /api/scheduler/configs
```

#### 获取忽略的数据源列表
```
GET /api/scheduler/ignored-sources
```

#### 更新数据源配置
```
PUT /api/scheduler/config/{source}
```

请求体：
```json
{
  "enabled": true,    // 是否启用
  "interval": 30      // 抓取间隔（分钟）
}
```

## 功能特性

### 数据去重
- 基于 `source + url` 的组合进行去重
- 避免存储重复的热点内容
- 提高存储效率

### 数据源过滤
- 支持通过 `IGNORE_SAVE_SOURCES` 环境变量配置忽略的数据源
- 被忽略的数据源不会被保存到数据库，但仍可通过API获取实时数据
- 支持动态配置，无需重启服务

### 时间戳处理
- 如果热点数据包含 `timestamp`，直接使用
- 如果没有 `timestamp`，使用当前时间戳
- 确保每条记录都有有效的时间戳

### 定时任务
- 每分钟检查一次需要抓取的数据源
- 支持为不同数据源配置不同的抓取间隔
- 支持启用/禁用特定数据源
- 记录最后抓取时间，避免重复抓取
- 支持通过环境变量控制是否自动启动
- 支持手动启动/停止定时任务

### 查询优化
- 支持全文搜索（标题和描述）
- 支持时间范围查询
- 支持分页和排序
- 建立索引优化查询性能

## 使用示例

### 1. 启动服务
```bash
npm run start:dev
```

### 2. 查看定时任务状态
```bash
curl http://localhost:6688/api/scheduler/status
```

### 3. 手动触发数据抓取
```bash
curl -X POST http://localhost:6688/api/scheduler/trigger \
  -H "Content-Type: application/json" \
  -d '{"source": "zhihu"}'
```

### 4. 查询历史数据
```bash
# 查询知乎的热点数据
curl "http://localhost:6688/api/history/search?source=zhihu&page=1&limit=10"

# 搜索包含"AI"关键词的数据
curl "http://localhost:6688/api/history/search?keyword=AI&page=1&limit=10"

# 查询特定时间范围的数据
curl "http://localhost:6688/api/history/search?startDate=2024-01-01&endDate=2024-01-31"
```

### 5. 查看数据统计
```bash
curl http://localhost:6688/api/history/stats
```

## 配置说明

### 环境变量
- `MONGODB_URI`: MongoDB 连接字符串
- `IGNORE_SAVE_SOURCES`: 忽略保存的数据源，用逗号分隔（如：`v2ex,github,hostloc`）
- `SCHEDULER_AUTO_START`: 定时任务自动启动配置（`true`/`false`），默认为 `true`

### 默认配置
- 定时任务检查间隔：每分钟
- 数据源默认抓取间隔：30分钟
- 查询分页默认大小：20条
- 查询分页最大大小：100条

## 注意事项

1. 确保 MongoDB 服务已启动并可连接
2. 首次启动时会自动初始化数据源配置
3. 定时任务会在服务启动后自动开始运行
4. 历史数据永久保存，不会自动删除
5. 建议定期监控数据库大小和性能
