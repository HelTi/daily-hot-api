import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class HotListQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return false;
  })
  noCache?: boolean;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return false;
  })
  rss?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  // 支持动态参数，其他参数不需要在这里定义
  [key: string]: any;
}
