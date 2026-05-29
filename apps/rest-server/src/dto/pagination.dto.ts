import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Page number (1-based).',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Number of records per page. Max 100.',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page number (1-based).', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page.', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of records across all pages.', example: 247 })
  total!: number;

  @ApiProperty({ description: 'Total number of pages.', example: 13 })
  totalPages!: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Page of records.', isArray: true })
  data!: T[];

  @ApiProperty({ description: 'Pagination metadata.', type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

/** Helper to build a paginated response from total count + items */
export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
