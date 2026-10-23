import { configValidationSchema, ConfigType } from './validation.schema';

// 默认值只由 Schema 定义。ConfigModule.validate 先补齐缺失的环境变量。
export default (): ConfigType => configValidationSchema.parse(process.env);
