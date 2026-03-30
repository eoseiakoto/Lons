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
} from '@nestjs/swagger';
import { PaymentService } from '@lons/repayment-service';
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
  @ApiOperation({ summary: 'Record a repayment' })
  @ApiResponse({ status: 201, description: 'Repayment recorded' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Idempotency key for duplicate prevention' })
  async create(
    @Req() req: any,
    @Body() body: CreateRepaymentDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    return this.paymentService.processPayment(tenantId, {
      contractId: body.contractId,
      amount: parseFloat(body.amount),
      currency: body.currency,
      method: body.method,
      source: body.source,
      externalRef: body.externalRef,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List repayments with filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of repayments' })
  @ApiQuery({ name: 'contractId', required: false, description: 'Filter by contract ID' })
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
