import { IsOptional, IsString } from 'class-validator';

export class TriggerFetchDto {
  @IsOptional()
  @IsString()
  source?: string;
}
