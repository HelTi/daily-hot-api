import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DiscoveryModule } from '@nestjs/core';
import { HotListsController } from './hot-lists.controller';
import { HotListsService } from './hot-lists.service';
import { HOT_LIST_SOURCES } from './sources';
import { HttpClientModule } from '../http/http.module';
import { TokenModule } from '../token/token.module';
import { RssModule } from '../rss/rss.module';

@Module({
  imports: [
    // 用于自动发现源
    DiscoveryModule,
    // 用于网络请求
    HttpClientModule,
    // 供 Douyin 等源获取原始响应头（如 Set-Cookie）
    HttpModule.register({ timeout: 8000 }),
    // 用于Token服务（Bilibili WBI签名）
    TokenModule,
    // 用于RSS生成
    RssModule,
  ],
  controllers: [HotListsController],
  providers: [HotListsService, ...HOT_LIST_SOURCES],
  exports: [HotListsService],
})
export class HotListsModule {}
