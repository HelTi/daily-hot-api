import { Injectable, Logger } from '@nestjs/common';
import { Feed } from 'feed';
import { RouterData } from 'src/host-lists/interfaces/router-data.interface';

@Injectable()
export class RssService {
  private readonly logger = new Logger(RssService.name);

  /**
   * 生成RSS内容
   * @param data 热榜数据
   * @returns RSS XML字符串
   */
  generateRss(data: RouterData): string {
    try {
      // 创建RSS订阅
      const feed = new Feed({
        title: `${data.title} - ${data.type}`,
        description: data.description || `${data.title}的${data.type}`,
        id: data.name,
        link: data.link,
        language: 'zh',
        generator: 'daily-hot-api',
        copyright: 'Copyright © 2020-present Helti',
        updated: new Date(data.updateTime),
      });

      // 添加项目
      data.data.forEach((item) => {
        feed.addItem({
          title: item.title,
          description: item.desc || item.title,
          link: item.url,
          guid: item.id.toString(),
          date: item.timestamp ? new Date(item.timestamp) : new Date(),
          enclosure: item.cover ? { url: item.cover } : undefined,
          author: [{ name: item.author || '' }],
        });
      });

      // 生成XML
      const xml = feed.rss2();
      return xml;
    } catch (error: any) {
      this.logger.error(`Failed to generate RSS: ${error}`);
      return JSON.stringify(error);
    }
  }
}
