import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiHeader,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CustomerService } from '@lons/entity-service';
import { AuditAction } from '@lons/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { PaginationQueryDto, buildPaginatedResponse } from '../dto/pagination.dto';

@ApiTags('Customers')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @AuditAction('create.customer', 'customer')
  @ApiOperation({
    summary: 'Create or sync a customer',
    description:
      'Creates a new customer or returns an existing one if the dedup engine matches an existing record. ' +
      'Authentication: API key + secret (X-API-Key / X-API-Secret). ' +
      'Idempotent via the optional X-Idempotency-Key header — repeated calls with the same key return the cached response.',
  })
  @ApiBody({ type: CreateCustomerDto })
  @ApiResponse({ status: 201, description: 'Customer created or matched to an existing record (see isDuplicate flag).' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Prevents duplicate operations on retry.' })
  async create(@Req() req: any, @Body() body: CreateCustomerDto): Promise<any> {
    const tenantId = req.tenantId;
    // S17-8: create() now returns { customer, isDuplicate, matchedRule }
    // to surface dedup outcomes. Flatten the customer fields back into
    // the REST response shape and propagate the dedup metadata as
    // top-level booleans so clients can distinguish "I created" from
    // "I matched an existing record". Existing integrations that only
    // read the customer fields keep working — the new keys are additive.
    const result = await this.customerService.create(tenantId, {
      externalId: body.externalId,
      fullName: `${body.firstName} ${body.lastName}`,
      phonePrimary: body.phone,
      email: body.email,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      nationalId: body.nationalId,
      nationalIdType: body.idType,
    });
    return {
      ...result.customer,
      isDuplicate: result.isDuplicate,
      matchedRule: result.matchedRule,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a customer by ID',
    description: 'Returns full customer details, scoped to the authenticated tenant.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer details' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async findOne(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.customerService.findById(tenantId, id);
  }

  @Get()
  @ApiOperation({
    summary: 'List customers',
    description: 'Paginated list of customers for the authenticated tenant. Use `search` for free-text filtering.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of customers' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, phone, or external ID' })
  async findAll(
    @Req() req: any,
    @Query() pagination: PaginationQueryDto,
    @Query('search') search?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.customerService.findAll(tenantId, { skip, take: limit, search }),
      this.customerService.count(tenantId, { search }),
    ]);

    return buildPaginatedResponse(items, total, page, limit);
  }
}
