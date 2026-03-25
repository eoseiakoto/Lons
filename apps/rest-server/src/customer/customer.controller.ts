import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('v1/customers')
export class CustomerController {
  @Post()
  @ApiOperation({ summary: 'Register a new customer' })
  @ApiResponse({ status: 201, description: 'Customer registered' })
  async create(@Body() body: any) {
    return {
      message: 'Customer registration endpoint — connect to EntityService',
      id: crypto.randomUUID(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer details' })
  async findOne(@Param('id') id: string) {
    return { id, message: 'Customer detail endpoint — connect to EntityService' };
  }

  @Get(':id/credit-summary')
  @ApiOperation({ summary: 'Get customer credit summary' })
  async creditSummary(@Param('id') id: string) {
    return { customerId: id, message: 'Credit summary endpoint — connect to ScoringService' };
  }
}
