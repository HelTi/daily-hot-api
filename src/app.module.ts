import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from './cache/cache.module';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HotListsModule } from './host-lists/hot-lists.module';
import { HistoryModule } from './history/history.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TokenModule } from './token/token.module';

@Module({
  imports: [
    CacheModule,
    AppConfigModule,
    DatabaseModule,
    HotListsModule,
    HistoryModule,
    SchedulerModule,
    TokenModule,
  ],
  controllers: [AppController],
  providers: [AppService, LoggerMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
