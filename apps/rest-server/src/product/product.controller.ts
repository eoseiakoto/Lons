import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('v1/products')
export class ProductController {
  @Get()
  @ApiOperation({ summary: 'List available loan products' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by product type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  async findAll(
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return {
      message: 'Products list endpoint — connect to EntityService',
      filters: { type, status },
    };
  }
}
