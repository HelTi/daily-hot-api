# 添加热榜源

本页以 `example` 来源为例，介绍新增数据源的最小实现和验证流程。

## 1. 创建来源文件

在 `src/host-lists/sources/example.source.ts` 中创建 Provider：

```ts
import { Injectable } from '@nestjs/common';
import { HttpClientService } from '../../http/http.service';
import { HotSource } from '../decorators/hot-source.decorator';
import { GetListOptions } from './source.types';
import { HotListSource } from '../interfaces/hot-list-source.interface';
import { HotListGetListResponse } from '../interfaces/hot-list.interface';

interface UpstreamItem {
  id: string;
  title: string;
  score: number;
  url: string;
}

@Injectable()
@HotSource({
  name: 'example',
  title: '示例热榜',
  type: '热榜',
  link: 'https://example.com',
  description: '示例数据源',
})
export class ExampleSource implements HotListSource {
  constructor(private readonly httpService: HttpClientService) {}

  async getList(
    _options: GetListOptions,
    noCache?: boolean,
  ): Promise<HotListGetListResponse> {
    const response = await this.httpService.get<UpstreamItem[]>({
      url: 'https://example.com/api/hot',
      noCache,
    });

    return {
      data: response.data.map((item) => ({
        id: item.id,
        title: item.title,
        hot: item.score,
        url: item.url,
        mobileUrl: item.url,
      })),
      fromCache: response.fromCache,
      updateTime: response.updateTime,
    };
  }
}
```

## 2. 遵守统一数据结构

每条记录必须至少包含：

- `id`
- `title`
- `url`
- `mobileUrl`

可选字段包括 `desc`、`cover`、`author`、`hot` 和毫秒级 `timestamp`。不要直接把上游响应原样返回，应映射成统一的 `HotListItem`。

如果来源支持类别或时间范围，可以通过 `params` 描述可选值，并从 `GetListOptions` 读取查询参数。

## 3. 注册 Provider

在 `src/host-lists/hot-lists.module.ts` 中：

1. 导入 `ExampleSource`。
2. 将 `ExampleSource` 加入 `providers` 数组。

只有加入 Nest Provider 后，`DiscoveryService` 才能发现 `@HotSource` 元数据。

## 4. 缓存和错误处理

- 优先使用项目的 `HttpClientService`，保持超时、Header 和缓存行为一致。
- 将控制器传入的 `noCache` 继续传给 HTTP 客户端。
- 对上游字段做运行时防御，避免单条异常数据导致整个来源失败。
- 上游需要签名或 Token 时，将可复用逻辑放入 `src/token`。
- 不要在源码、日志或文档里写入 Cookie、密钥和用户凭据。

## 5. 验证

```bash
npm run build
npx eslint "src/**/*.ts"
```

启动服务后确认来源已注册：

```bash
curl http://localhost:6688/hot-lists/all
curl 'http://localhost:6688/hot-lists/example?limit=10'
curl 'http://localhost:6688/hot-lists/example?noCache=true'
```

新增来源属于功能变更，还应在 `docs/development/sources/` 创建维护说明，记录上游地址、数据映射、特殊参数、失败模式和验证命令。
