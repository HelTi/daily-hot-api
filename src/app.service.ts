import { Injectable } from '@nestjs/common';
import { HotListsService } from './host-lists/hot-lists.service';

@Injectable()
export class AppService {
  constructor(private readonly hotListsService: HotListsService) {}

  getHomeData() {
    // 获取所有可用的热榜源
    const allSources = this.hotListsService.getAllSources();

    // 生成 API 示例，取前 6 个源作为示例
    const apiExamples = allSources.map((source) => {
      return {
        name: source,
        path: `/hot-lists/${source}`,
      };
    });

    return {
      title: '每日热榜聚合 API',
      description:
        '一个基于 NestJS 的每日热榜聚合 API 服务，支持多个平台的热榜数据获取，支持本地部署，pm2部署、docker部署。',
      features: [
        {
          icon: '📊',
          title: '多平台支持',
          description: '知乎、微博、百度、豆瓣、B站等',
        },
        {
          icon: '⚡',
          title: '高性能',
          description: '基于 NestJS 框架构建',
        },
        {
          icon: '🐳',
          title: '容器化',
          description: '支持 Docker 部署',
        },
      ],
      apiExamples,
      slogan: '让数据获取更简单，让信息聚合更高效',
    };
  }
}
