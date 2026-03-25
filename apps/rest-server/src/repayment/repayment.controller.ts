import { Controller, Post, Body, Headers } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';

@ApiTags('Repayments')
@ApiBearerAuth()
@Controller('v1/repayments')
export class RepaymentController {
  @Post()
  @ApiOperation({ summary: 'Record a repayment' })
  @ApiResponse({ status: 201, description: 'Repayment recorded' })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: false,
    description: 'Idempotency key for duplicate prevention',
  })
  async create(
    @Body() body: any,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return {
      message: 'Repayment endpoint — connect to RepaymentService',
      idempotencyKey,
    };
  }
}
