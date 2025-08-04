/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, Logger } from '@nestjs/common';
import { RouterData } from 'src/host-lists/interfaces/router-data.interface';
import RSS from 'rss';

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
      const feed = new RSS({
        title: `${data.title} - ${data.type}`,
        description: data.description || `${data.title}的${data.type}`,
        feed_url: data.link,
        site_url: data.link,
        language: 'zh',
        generator: 'daily-hot-api',
        copyright: 'Copyright © 2020-present Helti',
        pubDate: new Date(data.updateTime),
      });

      // 添加项目
      data.data.forEach((item) => {
        feed.item({
          title: item.title,
          description: item.desc || item.title,
          url: item.url,
          guid: item.id.toString(),
          date: item.timestamp ? new Date(item.timestamp) : new Date(),
          author: item.author || '',
        });
      });

      // 生成XML
      const xml = feed.xml({ indent: true });
      return xml;
    } catch (error: any) {
      this.logger.error(`Failed to generate RSS: ${error}`);
      return JSON.stringify(error);
    }
  }
}
