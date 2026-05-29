import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { PrismaService } from '@lons/database';
import {
  BnplEligibilityService,
  BnplInstallmentService,
  BnplOriginationService,
  BnplRefundService,
} from '@lons/process-engine';
import { AuditAction, NotFoundError, RequiresPlan } from '@lons/common';

import { ApiKeyGuard } from '../guards/api-key.guard';
import {
  EligibilityQueryDto,
  InitiateBnplPurchaseDto,
  InstallmentPaymentDto,
  RefundDto,
} from './bnpl-purchase.dto';

interface ApiKeyRequest extends Request {
  apiKey?: { tenantId: string };
}

/**
 * BNPL purchase endpoints (Sprint 11 Track B / B4).
 *
 *   POST /api/v1/bnpl/purchases  — merchant initiates a purchase
 *   GET  /api/v1/bnpl/purchases/:id — read transaction + schedule
 *
 * Auth via the standard `ApiKeyGuard` — the merchant integrates with the
 * tenant's API key. The guard sets `request.apiKey.tenantId` which the
 * controller pulls into every call.
 */
@ApiTags('BNPL')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('bnpl')
export class BnplController {
  constructor(
    private readonly origination: BnplOriginationService,
    private readonly eligibility: BnplEligibilityService,
    private readonly installment: BnplInstallmentService,
    private readonly refund: BnplRefundService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('eligible')
  @ApiOperation({
    summary: 'Pre-qualify a customer for a BNPL purchase',
    description:
      'Sub-2s eligibility check at merchant checkout. Returns approve/decline + limits without creating a transaction. ' +
      'Authentication: API key + secret.',
  })
  @ApiQuery({ name: 'merchantCode', required: true, description: 'Merchant code (unique within tenant).' })
  @ApiQuery({ name: 'customerId', required: true, description: 'Customer UUID.' })
  @ApiQuery({ name: 'amount', required: true, description: 'Purchase amount as a decimal string (e.g. "120.00").' })
  @ApiQuery({ name: 'currency', required: true, description: 'ISO 4217 currency code, e.g. "GHS".' })
  @ApiResponse({ status: 200, description: 'Eligibility decision.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Merchant or customer not found.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async eligible(
    @Req() req: ApiKeyRequest,
    @Query() query: EligibilityQueryDto,
  ) {
    const tenantId = this.requireTenantId(req);
    return this.prisma.enterTenantContext({ tenantId }, () =>
      this.eligibility.check(tenantId, {
        merchantCode: query.merchantCode,
        customerId: query.customerId,
        amount: query.amount,
        currency: query.currency,
      }),
    );
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Post('purchases')
  @HttpCode(HttpStatus.CREATED)
  @AuditAction('initiate.bnplPurchase', 'bnpl_transaction')
  @ApiOperation({
    summary: 'Initiate a BNPL purchase',
    description:
      'Creates a BNPL transaction at checkout, scoring + originating + generating the installment schedule. ' +
      'Requires the growth plan tier or higher. Idempotent via the required idempotencyKey body field.',
  })
  @ApiBody({ type: InitiateBnplPurchaseDto })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Optional retry-safe header (in addition to the body-level idempotencyKey).' })
  @ApiResponse({ status: 201, description: 'Purchase approved; schedule returned.' })
  @ApiResponse({ status: 400, description: 'Validation error (KYC, bounds, etc.).' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'Tenant plan does not include BNPL (requires growth tier or higher).' })
  @ApiResponse({ status: 404, description: 'Merchant or customer not found.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async initiate(
    @Req() req: ApiKeyRequest,
    @Body() body: InitiateBnplPurchaseDto,
  ) {
    const tenantId = this.requireTenantId(req);
    return this.prisma.enterTenantContext({ tenantId }, () =>
      this.origination.initiate(tenantId, {
        merchantCode: body.merchantCode,
        customerId: body.customerId,
        purchaseAmount: body.purchaseAmount,
        currency: body.currency,
        numberOfInstallments: body.numberOfInstallments,
        purchaseRef: body.purchaseRef,
        merchantRef: body.merchantRef,
        items: body.items,
        idempotencyKey: body.idempotencyKey,
      }),
    );
  }

  @Get('purchases/:id')
  @ApiOperation({
    summary: 'Get a BNPL transaction with its installment schedule',
    description: 'Returns the transaction and the ordered installment schedule.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'BNPL transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction + schedule.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async getById(
    @Req() req: ApiKeyRequest,
    @Param('id') id: string,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(req);
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      const tx = await this.prisma.bnplTransaction.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          installments: { orderBy: { installmentNumber: 'asc' } },
        },
      });
      if (!tx) throw new NotFoundError('BnplTransaction', id);
      return tx;
    });
  }

  @RequiresPlan('growth')
  @Post('installments/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @AuditAction('record.bnplInstallmentPayment', 'bnpl_installment')
  @ApiOperation({
    summary: 'Record a payment against a single installment',
    description: 'Applies a payment to a specific BNPL installment. Requires the growth plan tier or higher.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Installment UUID' })
  @ApiBody({ type: InstallmentPaymentDto })
  @ApiResponse({ status: 201, description: 'Payment recorded.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'Tenant plan does not include BNPL.' })
  @ApiResponse({ status: 404, description: 'Installment not found.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async payInstallment(
    @Req() req: ApiKeyRequest,
    @Param('id') installmentId: string,
    @Body() body: InstallmentPaymentDto,
  ) {
    const tenantId = this.requireTenantId(req);
    return this.prisma.enterTenantContext({ tenantId }, () =>
      this.installment.processInstallmentPayment(tenantId, installmentId, body.amount),
    );
  }

  @RequiresPlan('growth')
  @Post('purchases/:id/refunds')
  @HttpCode(HttpStatus.CREATED)
  @AuditAction('refund.bnplPurchase', 'bnpl_transaction')
  @ApiOperation({
    summary: 'Refund a BNPL purchase',
    description: 'Initiates a full or partial refund on a BNPL transaction. Requires the growth plan tier or higher.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'BNPL transaction UUID' })
  @ApiBody({ type: RefundDto })
  @ApiResponse({ status: 201, description: 'Refund initiated.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'Tenant plan does not include BNPL.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async refundPurchase(
    @Req() req: ApiKeyRequest,
    @Param('id') transactionId: string,
    @Body() body: RefundDto,
  ) {
    const tenantId = this.requireTenantId(req);
    const operatorId = req.apiKey?.tenantId ?? 'system'; // Merchant API uses tenantId as operator stand-in
    return this.prisma.enterTenantContext({ tenantId }, () =>
      this.refund.initiate(tenantId, {
        transactionId,
        amount: body.amount,
        type: body.type,
        reason: body.reason,
        operatorId,
      }),
    );
  }

  private requireTenantId(req: ApiKeyRequest): string {
    const tenantId = req.apiKey?.tenantId;
    if (!tenantId) {
      throw new Error('ApiKeyGuard did not populate request.apiKey.tenantId');
    }
    return tenantId;
  }
}
