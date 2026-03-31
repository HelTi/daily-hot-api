import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { HotItem, HotItemSchema } from './schemas/hot-item.schema';
import {
  SourceConfig,
  SourceConfigSchema,
} from './schemas/source-config.schema';
import { HotItemRepository } from './repositories/hot-item.repository';
import { SourceConfigRepository } from './repositories/source-config.repository';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/daily-hot-api',
        lazyConnection: true,
        retryAttempts: 3,
        retryDelay: 2000,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 10000,
        connectionFactory: (connection) => {
          connection.on('error', (error) => {
            console.warn('MongoDB连接错误，但服务继续运行:', error.message);
          });
          connection.on('disconnected', () => {
            console.warn('MongoDB连接断开，但服务继续运行');
          });
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return connection;
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: HotItem.name, schema: HotItemSchema },
      { name: SourceConfig.name, schema: SourceConfigSchema },
    ]),
  ],
  providers: [HotItemRepository, SourceConfigRepository],
  exports: [HotItemRepository, SourceConfigRepository],
})
export class DatabaseModule {}
