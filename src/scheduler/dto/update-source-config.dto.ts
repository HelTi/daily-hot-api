import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSourceConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  interval?: number;
}
