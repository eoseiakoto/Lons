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
} from '@nestjs/swagger';
import { CustomerService } from '@lons/entity-service';
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
  @ApiOperation({ summary: 'Create or sync a customer' })
  @ApiResponse({ status: 201, description: 'Customer created or synced' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid API key' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Idempotency key for duplicate prevention' })
  async create(@Req() req: any, @Body() body: CreateCustomerDto): Promise<any> {
    const tenantId = req.tenantId;
    return this.customerService.create(tenantId, {
      externalId: body.externalId,
      fullName: `${body.firstName} ${body.lastName}`,
      phonePrimary: body.phone,
      email: body.email,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      nationalId: body.nationalId,
      nationalIdType: body.idType,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer details by ID' })
  @ApiResponse({ status: 200, description: 'Customer details' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findOne(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.customerService.findById(tenantId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List customers with pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of customers' })
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
