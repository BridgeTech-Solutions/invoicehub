import { Transform } from 'class-transformer';

export class PaginationDto {
  @Transform(({ value }) => Math.max(1, parseInt(String(value ?? '1'))))
  page: number = 1;

  @Transform(({ value }) => Math.min(100, Math.max(1, parseInt(String(value ?? '20')))))
  limit: number = 20;
}
