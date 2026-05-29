import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorDetail {
  @ApiProperty({
    description: 'Machine-readable error code (UPPER_SNAKE_CASE).',
    example: 'VALIDATION_ERROR',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable error message — safe for display.',
    example: 'amount must be a valid decimal string',
  })
  message!: string;

  @ApiPropertyOptional({
    description: 'Additional context (field path, original input, etc.). Shape varies by error.',
    example: { field: 'amount' },
  })
  details?: any;
}

export class ErrorResponseDto {
  @ApiProperty({ type: 'null', description: 'Always null on error.', nullable: true, example: null })
  data!: null;

  @ApiProperty({ type: [ErrorDetail], description: 'List of one or more errors.' })
  errors!: ErrorDetail[];

  @ApiProperty({
    description: 'Response metadata. Always present.',
    example: { requestId: 'abc-123', timestamp: '2026-05-29T00:00:00.000Z' },
  })
  meta!: { requestId: string; timestamp: string };
}
