import { Module } from '@nestjs/common';
import { RssService } from './rss.service';

@Module({
  providers: [RssService],
  exports: [RssService],
})
export class RssModule {}
