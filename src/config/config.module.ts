import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configValidationSchema } from './validation.schema';
import configuration from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: (config) => {
        try {
          const validated = configValidationSchema.parse(config);
          if (config.NODE_ENV === 'production' && !validated.MONGODB_URI) {
            // 镜像和 pm2 的 ecosystem 都带 NODE_ENV=production，所以这条提示
            // 必须说清该在哪里补变量，否则只会看到一行无从下手的启动失败。
            throw new Error(
              'MONGODB_URI is required when NODE_ENV=production. ' +
                'Set it in .env (see .env.example), or pass it to the process: ' +
                'docker run -e MONGODB_URI=mongodb://<host>:27017/daily-hot-api',
            );
          }
          return validated;
        } catch (error) {
          throw new Error(`配置验证失败: ${error}`);
        }
      },
      validationOptions: {
        abortEarly: true,
      },
    }),
  ],
})
export class AppConfigModule {}
