import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '🚀 一个基于 NestJS 的每日热榜聚合 API 服务，支持多个平台的热榜数据获取，支持本地部署，pm2部署、docker部署。🔥';
  }
}
