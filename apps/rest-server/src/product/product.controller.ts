import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductService } from '@lons/entity-service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Products')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({
    summary: 'List loan products',
    description: 'Returns all loan products available to the authenticated tenant. Filter by type and status.',
  })
  @ApiResponse({ status: 200, description: 'List of loan products' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by product type', enum: ['OVERDRAFT', 'MICRO_LOAN', 'BNPL', 'INVOICE_FACTORING'] })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status', enum: ['ACTIVE', 'INACTIVE', 'DRAFT'] })
  async findAll(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    return this.productService.findAll(tenantId, { type, status });
  }
}
