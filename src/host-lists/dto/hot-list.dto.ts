import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class HotListQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  noCache?: boolean;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  rss?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  // 支持动态参数，其他参数不需要在这里定义
  [key: string]: any;
}
