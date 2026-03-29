import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetail {
  @ApiProperty({ description: 'Machine-readable error code' })
  code!: string;

  @ApiProperty({ description: 'Human-readable error message' })
  message!: string;

  @ApiProperty({ required: false, description: 'Additional error context' })
  details?: any;
}

export class ErrorResponseDto {
  @ApiProperty({ type: 'null', description: 'Always null on error' })
  data!: null;

  @ApiProperty({ type: [ErrorDetail], description: 'List of errors' })
  errors!: ErrorDetail[];

  @ApiProperty({
    description: 'Response metadata',
    example: { requestId: 'abc-123', timestamp: '2026-03-27T00:00:00.000Z' },
  })
  meta!: { requestId: string; timestamp: string };
}
