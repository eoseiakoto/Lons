import {
  Controller,
  Post,
  Get,
  Param,
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
import { LoanRequestService, OfferService } from '@lons/process-engine';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { CreateLoanRequestDto } from '../dto/create-loan-request.dto';
import { PaginationQueryDto, buildPaginatedResponse } from '../dto/pagination.dto';

@ApiTags('Loan Requests')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('loan-requests')
export class LoanRequestController {
  constructor(
    private readonly loanRequestService: LoanRequestService,
    private readonly offerService: OfferService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Submit a loan request' })
  @ApiResponse({ status: 201, description: 'Loan request created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Idempotency key for duplicate prevention' })
  async create(
    @Req() req: any,
    @Body() body: CreateLoanRequestDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    return this.loanRequestService.create(tenantId, {
      customerId: body.customerId,
      productId: body.productId,
      requestedAmount: Number(body.amount),
      requestedTenor: body.termDays ? Number(body.termDays) : undefined,
      currency: body.currency,
      idempotencyKey,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan request status and details' })
  @ApiResponse({ status: 200, description: 'Loan request details' })
  @ApiResponse({ status: 404, description: 'Loan request not found' })
  async findOne(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.loanRequestService.findById(tenantId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List loan requests with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of loan requests' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by product ID' })
  async findAll(
    @Req() req: any,
    @Query() pagination: PaginationQueryDto,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('productId') productId?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.loanRequestService.findAll(tenantId, { skip, take: limit, customerId, status, productId }),
      this.loanRequestService.count(tenantId, { customerId, status, productId }),
    ]);

    return buildPaginatedResponse(items, total, page, limit);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Accept a loan offer' })
  @ApiResponse({ status: 200, description: 'Offer accepted' })
  @ApiResponse({ status: 404, description: 'Loan request not found' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false })
  async accept(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.offerService.acceptOffer(tenantId, id);
  }
}
