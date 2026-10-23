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

  // 源特定参数也必须有校验元数据，否则全局 whitelist 会拒绝请求。
  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsString()
  day?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  game?: string;
}
