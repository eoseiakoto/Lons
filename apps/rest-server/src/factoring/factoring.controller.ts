import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { Prisma, PrismaService } from '@lons/database';
import {
  DebtorService,
  FactoringOriginationService,
  InvoiceSubmissionService,
} from '@lons/process-engine';
import { AuditAction, RequiresPlan } from '@lons/common';

import { ApiKeyGuard } from '../guards/api-key.guard';
import {
  AcceptOfferDto,
  CreateDebtorDto,
  DebtorListQueryDto,
  DeclineOfferDto,
  SubmitInvoiceDto,
} from './factoring.dto';

interface ApiKeyRequest extends Request {
  tenantId?: string;
}

/**
 * Sprint 12 Phase 4B — Seller-facing Invoice Factoring REST API.
 *
 *   POST /v1/invoices/submit         — submit invoice for factoring
 *   GET  /v1/invoices/:id            — read invoice + offer terms
 *   POST /v1/invoices/:id/accept     — accept the financing offer
 *   POST /v1/invoices/:id/decline    — decline the offer
 *   GET  /v1/debtors                 — list debtors (cursor pagination)
 *   POST /v1/debtors                 — create debtor
 *   GET  /v1/debtors/:id             — read debtor
 *
 * Auth via the standard `ApiKeyGuard` — the seller's integration uses the
 * tenant API key. The guard sets `request.tenantId` which the controller
 * pulls into every call. The global prefix `v1` supplies the version
 * segment, so this controller is rooted at `/`.
 */
@ApiTags('Invoice Factoring')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller()
export class FactoringController {
  constructor(
    private readonly debtorService: DebtorService,
    private readonly invoiceSubmission: InvoiceSubmissionService,
    private readonly origination: FactoringOriginationService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Invoices ──────────────────────────────────────────────────────────

  // S14-10: invoice factoring is an enterprise-only product.
  @RequiresPlan('enterprise')
  @Post('invoices/submit')
  @HttpCode(HttpStatus.CREATED)
  @AuditAction('submit.invoice', 'invoice')
  @ApiOperation({ summary: 'Submit an invoice for factoring' })
  @ApiResponse({ status: 201, description: 'Invoice submitted; verification routing decided.' })
  @ApiResponse({ status: 400, description: 'Validation error (face value, dates, debtor status, concentration breach).' })
  @ApiResponse({ status: 404, description: 'Seller, debtor, or product not found.' })
  async submitInvoice(
    @Req() req: ApiKeyRequest,
    @Body() body: SubmitInvoiceDto,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(req);
    return this.invoiceSubmission.submit(tenantId, {
      idempotencyKey: body.idempotencyKey,
      sellerId: body.sellerId,
      debtorId: body.debtorId,
      productId: body.productId,
      invoiceNumber: body.invoiceNumber,
      issueDate: body.issueDate,
      dueDate: body.dueDate,
      faceValue: body.faceValue,
      currency: body.currency,
      recourseType: body.recourseType,
      documents: body.documents as Prisma.InputJsonValue | undefined,
      metadata: body.metadata as Prisma.InputJsonValue | undefined,
    });
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Read an invoice — status, offer terms, and lifecycle timestamps' })
  @ApiResponse({ status: 200, description: 'Invoice details.' })
  @ApiResponse({ status: 404, description: 'Invoice not found.' })
  async getInvoice(
    @Req() req: ApiKeyRequest,
    @Param('id') id: string,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(req);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Invoice ${id} not found`,
      });
    }
    return invoice;
  }

  // S14-10: invoice factoring is an enterprise-only product.
  @RequiresPlan('enterprise')
  @Post('invoices/:id/accept')
  @HttpCode(HttpStatus.OK)
  @AuditAction('accept.invoiceOffer', 'invoice')
  @ApiOperation({ summary: 'Seller accepts the financing offer' })
  @ApiResponse({ status: 200, description: 'Offer accepted; invoice moves to offer_accepted.' })
  @ApiResponse({ status: 400, description: 'Invoice is not in offer_generated state.' })
  @ApiResponse({ status: 404, description: 'Invoice not found.' })
  async acceptOffer(
    @Req() req: ApiKeyRequest,
    @Param('id') id: string,
    @Body() body: AcceptOfferDto,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(req);
    return this.origination.acceptOffer(tenantId, id, body.idempotencyKey);
  }

  // S14-10: invoice factoring is an enterprise-only product.
  @RequiresPlan('enterprise')
  @Post('invoices/:id/decline')
  @HttpCode(HttpStatus.OK)
  @AuditAction('decline.invoiceOffer', 'invoice')
  @ApiOperation({ summary: 'Seller declines the financing offer' })
  @ApiResponse({ status: 200, description: 'Offer declined; invoice moves to cancelled.' })
  @ApiResponse({ status: 400, description: 'Invoice is not in offer_generated state.' })
  @ApiResponse({ status: 404, description: 'Invoice not found.' })
  async declineOffer(
    @Req() req: ApiKeyRequest,
    @Param('id') id: string,
    @Body() body: DeclineOfferDto = {},
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(req);
    return this.origination.declineOffer(tenantId, id, body?.reason);
  }

  // ─── Debtors ───────────────────────────────────────────────────────────

  @Get('debtors')
  @ApiOperation({ summary: 'List debtors (cursor pagination)' })
  @ApiResponse({ status: 200, description: 'Page of debtors with optional nextCursor.' })
  async listDebtors(
    @Req() req: ApiKeyRequest,
    @Query() query: DebtorListQueryDto,
  ): Promise<{ data: unknown; nextCursor: string | null }> {
    const tenantId = this.requireTenantId(req);
    const { items, nextCursor } = await this.debtorService.findMany(
      tenantId,
      {
        status: query.status,
        industrySector: query.industrySector,
        country: query.country,
        search: query.search,
      },
      { cursor: query.cursor, limit: query.limit },
    );
    return { data: items, nextCursor };
  }

  // S14-10: invoice factoring is an enterprise-only product.
  @RequiresPlan('enterprise')
  @Post('debtors')
  @HttpCode(HttpStatus.CREATED)
  @AuditAction('create.debtor', 'debtor')
  @ApiOperation({ summary: 'Create a debtor' })
  @ApiResponse({ status: 201, description: 'Debtor created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  async createDebtor(
    @Req() req: ApiKeyRequest,
    @Body() body: CreateDebtorDto,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(req);
    return this.debtorService.create(tenantId, {
      companyName: body.companyName,
      country: body.country,
      tradingName: body.tradingName,
      registrationNumber: body.registrationNumber,
      taxId: body.taxId,
      industrySector: body.industrySector,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      contactName: body.contactName,
      address: body.address as Prisma.InputJsonValue | undefined,
      paymentTerms: body.paymentTerms,
      externalCreditRating: body.externalCreditRating,
      exposureLimit: body.exposureLimit,
      metadata: body.metadata as Prisma.InputJsonValue | undefined,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('debtors/:id')
  @ApiOperation({ summary: 'Read a debtor' })
  @ApiResponse({ status: 200, description: 'Debtor details.' })
  @ApiResponse({ status: 404, description: 'Debtor not found.' })
  async getDebtor(
    @Req() req: ApiKeyRequest,
    @Param('id') id: string,
  ): Promise<unknown> {
    const tenantId = this.requireTenantId(req);
    return this.debtorService.findById(tenantId, id);
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private requireTenantId(req: ApiKeyRequest): string {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new Error('ApiKeyGuard did not populate request.tenantId');
    }
    return tenantId;
  }
}
