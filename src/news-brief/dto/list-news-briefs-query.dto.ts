import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ListNewsBriefsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['generating', 'success', 'failed'])
  status?: 'generating' | 'success' | 'failed';

  @IsOptional()
  // 与 latest/digest/:date 的 normalizePeriod 对齐：`?period=` 空串按缺省 daily。
  @Transform(({ value }): unknown => {
    if (typeof value !== 'string') return value as unknown;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,31}$/)
  period?: string;
}
