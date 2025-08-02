import { Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { CacheModule } from '../cache/cache.module';
import { HttpClientModule } from '../http/http.module';

@Module({
  imports: [
    CacheModule, // 缓存模块
    HttpClientModule, // HTTP 客户端模块
  ],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
