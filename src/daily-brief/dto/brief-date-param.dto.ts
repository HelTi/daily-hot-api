import { Matches } from 'class-validator';

export class BriefDateParamDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date: string;
}
