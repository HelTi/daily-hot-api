import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { HotListSource } from './interfaces/hot-list-source.interface';
import { RouterData } from './interfaces/router-data.interface';
import {
  HOT_SOURCE_METADATA,
  HotSourceOptions,
} from './decorators/hot-source.decorator';
import { Logger } from '@nestjs/common';
import { GetListOptions } from './sources/source.types';

@Injectable()
export class HotListsService implements OnModuleInit {
  private readonly sources: Map<string, HotListSource> = new Map();
  private readonly sourceMetadata: Map<
    string,
    { title: string; type: string; link?: string; description?: string }
  > = new Map();
  private readonly logger = new Logger(HotListsService.name);

  constructor(private readonly discoveryService: DiscoveryService) {}

  async onModuleInit() {
    await this.discoverSources();
  }

  /**
   * 自动发现并注册热榜源
   */
  private async discoverSources() {
    // 获取所有带有 @Injectable 装饰器的提供者
    const providers = this.discoveryService.getProviders();

    // Use Promise.all to make use of await, satisfying the async requirement
    await Promise.all(
      providers.map((provider) => {
        // 检查实例是否存在
        if (provider.instance && provider.metatype) {
          // 检查是否有我们的元数据
          const metadata = Reflect.getMetadata(
            HOT_SOURCE_METADATA,
            provider.metatype,
          ) as HotSourceOptions | undefined;

          if (metadata && this.isHotListSource(provider.instance)) {
            const { name, title, type, link, description } = metadata;
            // 注册源
            this.sources.set(name, provider.instance);
            this.sourceMetadata.set(name, { title, type, link, description });
            this.logger.log(`Registered hot list source: ${name} - ${title}`);
          }
        }
        return Promise.resolve();
      }),
    );
  }

  /**
   * 判断一个实例是否实现了HotListSource接口
   */
  private isHotListSource(instance: unknown): instance is HotListSource {
    return (
      instance !== null &&
      typeof instance === 'object' &&
      'getList' in instance &&
      typeof (instance as { getList: unknown }).getList === 'function'
    );
  }

  /**
   * 获取所有可用的热榜源名称
   */
  getAllSources(): string[] {
    return Array.from(this.sources.keys());
  }

  /**
   * 获取特定热榜的数据
   * @param sourceName 热榜源名称
   * @param noCache 是否跳过缓存
   */
  async getHotList(
    sourceName: string,
    options: GetListOptions,
    noCache: boolean = false,
  ): Promise<RouterData> {
    const source = this.sources.get(sourceName);

    if (!source) {
      throw new NotFoundException(`Source '${sourceName}' not found`);
    }

    try {
      // 在请求中设置了noCache参数时，一定不会使用缓存
      // 当没有设置noCache时，可能使用缓存，这由源的实现决定
      const result = await source.getList(options, noCache);
      const metadata = this.sourceMetadata.get(sourceName);

      // 检查结果是否来自HttpClientService的缓存
      const fromCache = result.fromCache ?? !noCache;

      // 构建结果数据
      const routerData: RouterData = {
        name: sourceName,
        title: metadata?.title || sourceName,
        type: result.type || metadata?.type || '热榜',
        link: metadata?.link,
        description: metadata?.description,
        total: result.data.length,
        data: result.data,
        fromCache, // 使用从源数据中提取或推断的缓存状态
        updateTime: new Date().toISOString(),
        params: result.params,
      };

      return routerData;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Failed to get data from ${sourceName}: ${errorMessage}`,
      );

      // 返回一个空结果，避免整个请求失败
      const metadata = this.sourceMetadata.get(sourceName);
      return {
        name: sourceName,
        title: metadata?.title || sourceName,
        type: metadata?.type || '热榜',
        link: metadata?.link,
        description: metadata?.description,
        total: 0,
        data: [],
        fromCache: false,
        updateTime: new Date().toISOString(),
        message: `Failed to get data: ${errorMessage}`,
      };
    }
  }
}
