import { Controller, Post, Get, Param, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Loan Requests')
@ApiBearerAuth()
@Controller('v1/loan-requests')
export class LoanRequestController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a loan request' })
  @ApiResponse({ status: 201, description: 'Loan request created' })
  async create(@Body() body: any, @Headers('x-idempotency-key') idempotencyKey?: string) {
    return {
      message: 'Loan request endpoint — connect to ProcessEngine in production',
      idempotencyKey,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan request by ID' })
  async findOne(@Param('id') id: string) {
    return { id, message: 'Connect to ProcessEngine in production' };
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a loan offer' })
  async accept(@Param('id') id: string) {
    return { id, message: 'Accept offer endpoint — connect to ProcessEngine' };
  }
}
