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
  ApiOperation,
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
import { NotFoundError } from '@lons/common';

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
    summary: 'Pre-qualify a customer for a BNPL purchase at checkout (sub-2s SLA)',
  })
  @ApiQuery({ name: 'merchantCode', required: true })
  @ApiQuery({ name: 'customerId', required: true })
  @ApiQuery({ name: 'amount', required: true })
  @ApiQuery({ name: 'currency', required: true })
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

  @Post('purchases')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a BNPL purchase at checkout' })
  @ApiResponse({ status: 201, description: 'Purchase approved; schedule returned.' })
  @ApiResponse({ status: 400, description: 'Validation error (KYC, bounds, etc.).' })
  @ApiResponse({ status: 404, description: 'Merchant or customer not found.' })
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
  @ApiOperation({ summary: 'Read a BNPL transaction with its installment schedule' })
  @ApiResponse({ status: 200, description: 'Transaction + schedule.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
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

  @Post('installments/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a payment against a single installment' })
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

  @Post('purchases/:id/refunds')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a full or partial refund on a BNPL transaction' })
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
