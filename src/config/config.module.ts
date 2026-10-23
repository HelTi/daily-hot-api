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
            throw new Error('MONGODB_URI is required in production');
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
