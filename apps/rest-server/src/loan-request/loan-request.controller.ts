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
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { LoanRequestService, OfferService } from '@lons/process-engine';
import { AuditAction } from '@lons/common';
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
  @AuditAction('create.loanRequest', 'loan_request')
  @ApiOperation({
    summary: 'Submit a loan request',
    description:
      'Creates a new loan request and runs pre-qualification + scoring. ' +
      'Authentication: API key + secret. ' +
      'Idempotent via X-Idempotency-Key — repeated calls return the original request.',
  })
  @ApiBody({ type: CreateLoanRequestDto })
  @ApiResponse({ status: 201, description: 'Loan request created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Prevents duplicate operations on retry.' })
  async create(
    @Req() req: any,
    @Body() body: CreateLoanRequestDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    // Pass amount as a string straight through (CLAUDE.md: never Number() money).
    return this.loanRequestService.create(tenantId, {
      customerId: body.customerId,
      productId: body.productId,
      requestedAmount: body.amount,
      requestedTenor: body.termDays ? Number(body.termDays) : undefined,
      currency: body.currency,
      idempotencyKey,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a loan request by ID',
    description: 'Returns the loan request and its current decision state.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Loan request UUID' })
  @ApiResponse({ status: 200, description: 'Loan request details' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Loan request not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async findOne(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.loanRequestService.findById(tenantId, id);
  }

  @Get()
  @ApiOperation({
    summary: 'List loan requests',
    description: 'Paginated list of loan requests for the authenticated tenant with optional filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of loan requests' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer UUID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by loan request status' })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by product UUID' })
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
  @AuditAction('accept.loanOffer', 'loan_request')
  @ApiOperation({
    summary: 'Accept a loan offer',
    description:
      'Accepts the offer produced for this loan request, moving the contract into the funding pipeline. ' +
      'Idempotent via X-Idempotency-Key.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Loan request UUID' })
  @ApiResponse({ status: 200, description: 'Offer accepted' })
  @ApiResponse({ status: 400, description: 'Offer not in an acceptable state (already accepted, expired, etc.)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Loan request not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Prevents duplicate operations on retry.' })
  async accept(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.offerService.acceptOffer(tenantId, id);
  }
}
