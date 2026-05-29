import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Headers,
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
  ApiBody,
} from '@nestjs/swagger';
import { PaymentService } from '@lons/repayment-service';
import { AuditAction } from '@lons/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { CreateRepaymentDto } from '../dto/create-repayment.dto';
import { PaginationQueryDto, buildPaginatedResponse } from '../dto/pagination.dto';

@ApiTags('Repayments')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('repayments')
export class RepaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @AuditAction('record.repayment', 'repayment')
  @ApiOperation({
    summary: 'Record a repayment',
    description:
      'Records a repayment against a contract. Amounts are decimal strings per CLAUDE.md §Money. ' +
      'Idempotent via X-Idempotency-Key — repeated calls return the same recorded payment.',
  })
  @ApiBody({ type: CreateRepaymentDto })
  @ApiResponse({ status: 201, description: 'Repayment recorded; waterfall allocation applied.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Prevents duplicate operations on retry.' })
  async create(
    @Req() req: any,
    @Body() body: CreateRepaymentDto,
    @Headers('x-idempotency-key') _idempotencyKey?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    // Pass amount as a string straight through. parseFloat() loses precision
    // beyond ~15 significant digits and is forbidden by CLAUDE.md for money.
    return this.paymentService.processPayment(tenantId, {
      contractId: body.contractId,
      amount: body.amount,
      currency: body.currency,
      method: body.method,
      source: body.source,
      externalRef: body.externalRef,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'List repayments',
    description: 'Paginated list of repayments for the authenticated tenant. Filter by contract.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of repayments' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiQuery({ name: 'contractId', required: false, description: 'Filter by contract UUID' })
  async findAll(
    @Req() req: any,
    @Query() pagination: PaginationQueryDto,
    @Query('contractId') contractId?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.paymentService.findAll(tenantId, { skip, take: limit, contractId }),
      this.paymentService.count(tenantId, { contractId }),
    ]);

    return buildPaginatedResponse(items, total, page, limit);
  }
}
