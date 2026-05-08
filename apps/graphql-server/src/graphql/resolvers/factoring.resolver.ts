import {
  Args,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
  NotFoundError,
  encodeCursor,
} from '@lons/common';
import {
  PrismaService,
  DebtorStatus,
  InvoiceStatus,
  Prisma,
  RecourseType,
} from '@lons/database';
import {
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  Roles,
} from '@lons/entity-service';
import {
  ConcentrationLimitService,
  DebtorService,
  FactoringOriginationService,
  InvoiceSubmissionService,
  RecourseService,
  ReserveService,
} from '@lons/process-engine';

import { CustomerType } from '../types/customer.type';
import {
  ConcentrationSummaryType,
  DebtorConnectionType,
  DebtorRiskResultType,
  DebtorStatusGql,
  DebtorType,
  InvoiceConnectionType,
  InvoiceOfferType,
  InvoiceStatusGql,
  InvoiceType,
  RecourseTypeGql,
} from '../types/factoring.type';
import {
  CreateDebtorInput,
  DebtorFiltersInput,
  FactoringPaginationInput,
  InvoiceFiltersInput,
  RecordDebtorPaymentInput,
  SubmitInvoiceInput,
  UpdateDebtorInput,
} from '../inputs/factoring.input';

/**
 * Invoice Factoring GraphQL surface (Sprint 12 Phase 4A).
 *
 *   Queries:
 *     debtors(filters?, pagination?) — paginated debtor list (Relay connection)
 *     debtor(debtorId)               — single debtor lookup
 *     debtorRiskAssessment(debtorId) — re-runs DebtorService.assessRisk
 *     invoices(filters?, pagination?) — paginated invoice list (Relay connection)
 *     invoice(invoiceId)             — single invoice lookup
 *     concentrationSummary           — admin dashboard payload
 *
 *   Mutations: createDebtor, updateDebtor, suspendDebtor, blacklistDebtor,
 *     reactivateDebtor, submitInvoice, resolveInvoiceVerification,
 *     generateInvoiceOffer, acceptInvoiceOffer, declineInvoiceOffer,
 *     disburseInvoiceAdvance, notifyInvoiceDebtor, recordInvoiceDebtorPayment,
 *     releaseInvoiceReserve, disputeInvoice.
 *
 * Every mutation accepts an `idempotencyKey` (carried into the underlying
 * service when supported, debug-logged otherwise pending the Sprint 12
 * ledger-backed dedupe table). Auth via `@Roles()` and `@AuditAction()`.
 */
@Resolver(() => InvoiceType)
export class FactoringResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debtorService: DebtorService,
    private readonly submissionService: InvoiceSubmissionService,
    private readonly originationService: FactoringOriginationService,
    private readonly reserveService: ReserveService,
    private readonly recourseService: RecourseService,
    private readonly concentrationService: ConcentrationLimitService,
  ) {}

  // ────── Queries ────────────────────────────────────────────────────────

  @Query(() => DebtorConnectionType)
  @Roles('debtor:read')
  async debtors(
    @CurrentTenant() tenantId: string,
    @Args('filters', { nullable: true }) filters?: DebtorFiltersInput,
    @Args('pagination', { nullable: true }) pagination?: FactoringPaginationInput,
  ): Promise<DebtorConnectionType> {
    const take = pagination?.first ?? 20;
    const after = pagination?.after;

    const where: Prisma.DebtorWhereInput = { tenantId, deletedAt: null };
    if (filters?.status) where.status = filters.status as DebtorStatus;
    if (filters?.industrySector) where.industrySector = filters.industrySector;
    if (filters?.country) where.country = filters.country;
    if (filters?.search) {
      where.OR = [
        { companyName: { contains: filters.search, mode: 'insensitive' } },
        { registrationNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, totalCount] = await Promise.all([
      this.prisma.debtor.findMany({
        where,
        take: take + 1,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.debtor.count({ where }),
    ]);

    const hasMore = items.length > take;
    const sliced = items.slice(0, take);
    return {
      edges: sliced.map((node) => ({
        node: node as unknown as DebtorType,
        cursor: encodeCursor(node.id),
      })),
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!after,
        startCursor: sliced.length > 0 ? encodeCursor(sliced[0].id) : undefined,
        endCursor:
          sliced.length > 0
            ? encodeCursor(sliced[sliced.length - 1].id)
            : undefined,
      },
      totalCount,
    };
  }

  @Query(() => DebtorType, { nullable: true })
  @Roles('debtor:read')
  async debtor(
    @CurrentTenant() tenantId: string,
    @Args('debtorId', { type: () => ID }) debtorId: string,
  ): Promise<DebtorType | null> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId, deletedAt: null },
    });
    return (debtor as unknown as DebtorType) ?? null;
  }

  @Query(() => DebtorRiskResultType)
  @Roles('debtor:read')
  async debtorRiskAssessment(
    @CurrentTenant() tenantId: string,
    @Args('debtorId', { type: () => ID }) debtorId: string,
  ): Promise<DebtorRiskResultType> {
    const result = await this.debtorService.assessRisk(tenantId, debtorId);
    return {
      score: result.score,
      averagePaymentDays: result.averagePaymentDays ?? undefined,
      reliabilityPercent: result.reliabilityPercent,
      factors: result.factors,
    };
  }

  @Query(() => InvoiceConnectionType)
  @Roles('contract:read')
  async invoices(
    @CurrentTenant() tenantId: string,
    @Args('filters', { nullable: true }) filters?: InvoiceFiltersInput,
    @Args('pagination', { nullable: true }) pagination?: FactoringPaginationInput,
  ): Promise<InvoiceConnectionType> {
    const take = pagination?.first ?? 20;
    const after = pagination?.after;

    const where: Prisma.InvoiceWhereInput = { tenantId };
    if (filters?.status) where.status = filters.status as InvoiceStatus;
    if (filters?.sellerId) where.sellerId = filters.sellerId;
    if (filters?.debtorId) where.debtorId = filters.debtorId;
    if (filters?.dateRangeFrom || filters?.dateRangeTo) {
      where.dueDate = {
        ...(filters.dateRangeFrom
          ? { gte: new Date(`${filters.dateRangeFrom}T00:00:00.000Z`) }
          : {}),
        ...(filters.dateRangeTo
          ? { lte: new Date(`${filters.dateRangeTo}T23:59:59.999Z`) }
          : {}),
      };
    }
    if (filters?.amountMin || filters?.amountMax) {
      where.faceValue = {
        ...(filters.amountMin ? { gte: filters.amountMin } : {}),
        ...(filters.amountMax ? { lte: filters.amountMax } : {}),
      };
    }

    const [items, totalCount] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        take: take + 1,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const hasMore = items.length > take;
    const sliced = items.slice(0, take);
    return {
      edges: sliced.map((node) => ({
        node: node as unknown as InvoiceType,
        cursor: encodeCursor(node.id),
      })),
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!after,
        startCursor: sliced.length > 0 ? encodeCursor(sliced[0].id) : undefined,
        endCursor:
          sliced.length > 0
            ? encodeCursor(sliced[sliced.length - 1].id)
            : undefined,
      },
      totalCount,
    };
  }

  @Query(() => InvoiceType, { nullable: true })
  @Roles('contract:read')
  async invoice(
    @CurrentTenant() tenantId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceType | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    return (invoice as unknown as InvoiceType) ?? null;
  }

  @Query(() => ConcentrationSummaryType)
  @Roles('contract:read')
  async concentrationSummary(
    @CurrentTenant() tenantId: string,
  ): Promise<ConcentrationSummaryType> {
    const summary =
      await this.concentrationService.getConcentrationSummary(tenantId);
    // The service emits identifiers / decimals already in the right shape;
    // we forward as-is and let the type system enforce the cast.
    return summary as unknown as ConcentrationSummaryType;
  }

  // ────── Debtor mutations ───────────────────────────────────────────────

  @Mutation(() => DebtorType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.CUSTOMER)
  @Roles('debtor:create')
  async createDebtor(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateDebtorInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<DebtorType> {
    this.logIdempotency('createDebtor', idempotencyKey);
    return (await this.debtorService.create(tenantId, {
      companyName: input.companyName,
      country: input.country,
      tradingName: input.tradingName,
      registrationNumber: input.registrationNumber,
      taxId: input.taxId,
      industrySector: input.industrySector,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      contactName: input.contactName,
      paymentTerms: input.paymentTerms,
      externalCreditRating: input.externalCreditRating,
      exposureLimit: input.exposureLimit,
      idempotencyKey,
    })) as unknown as DebtorType;
  }

  @Mutation(() => DebtorType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)
  @Roles('debtor:update')
  async updateDebtor(
    @CurrentTenant() tenantId: string,
    @Args('debtorId', { type: () => ID }) debtorId: string,
    @Args('input') input: UpdateDebtorInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<DebtorType> {
    this.logIdempotency('updateDebtor', idempotencyKey);
    return (await this.debtorService.update(tenantId, debtorId, {
      companyName: input.companyName,
      tradingName: input.tradingName,
      registrationNumber: input.registrationNumber,
      taxId: input.taxId,
      country: input.country,
      industrySector: input.industrySector,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      contactName: input.contactName,
      paymentTerms: input.paymentTerms,
      externalCreditRating: input.externalCreditRating,
      exposureLimit: input.exposureLimit,
    })) as unknown as DebtorType;
  }

  @Mutation(() => DebtorType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)
  @Roles('debtor:update')
  async suspendDebtor(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('debtorId', { type: () => ID }) debtorId: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<DebtorType> {
    this.logIdempotency('suspendDebtor', idempotencyKey);
    return (await this.debtorService.suspend(
      tenantId,
      debtorId,
      reason,
      user.userId,
    )) as unknown as DebtorType;
  }

  @Mutation(() => DebtorType)
  @AuditAction(AuditActionType.BLACKLIST, AuditResourceType.CUSTOMER)
  @Roles('debtor:update')
  async blacklistDebtor(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('debtorId', { type: () => ID }) debtorId: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<DebtorType> {
    this.logIdempotency('blacklistDebtor', idempotencyKey);
    return (await this.debtorService.blacklist(
      tenantId,
      debtorId,
      reason,
      user.userId,
    )) as unknown as DebtorType;
  }

  @Mutation(() => DebtorType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)
  @Roles('debtor:update')
  async reactivateDebtor(
    @CurrentTenant() tenantId: string,
    @Args('debtorId', { type: () => ID }) debtorId: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<DebtorType> {
    this.logIdempotency('reactivateDebtor', idempotencyKey);
    return (await this.debtorService.reactivate(
      tenantId,
      debtorId,
    )) as unknown as DebtorType;
  }

  // ────── Invoice mutations ──────────────────────────────────────────────

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.CONTRACT)
  @Roles('invoice:create')
  async submitInvoice(
    @CurrentTenant() tenantId: string,
    @Args('input') input: SubmitInvoiceInput,
  ): Promise<InvoiceType> {
    return (await this.submissionService.submit(tenantId, {
      idempotencyKey: input.idempotencyKey,
      sellerId: input.sellerId,
      debtorId: input.debtorId,
      productId: input.productId,
      invoiceNumber: input.invoiceNumber,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      faceValue: input.faceValue,
      currency: input.currency,
      recourseType: input.recourseType as RecourseType | undefined,
      documents: input.documents
        ? (JSON.parse(input.documents) as Prisma.InputJsonValue)
        : undefined,
      metadata: input.metadata
        ? (JSON.parse(input.metadata) as Prisma.InputJsonValue)
        : undefined,
    })) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('invoice:verify')
  async resolveInvoiceVerification(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('approved') approved: boolean,
    @Args('idempotencyKey') idempotencyKey: string,
    @Args('notes', { nullable: true }) notes?: string,
  ): Promise<InvoiceType> {
    this.logIdempotency('resolveInvoiceVerification', idempotencyKey);
    return (await this.submissionService.resolveVerification(
      tenantId,
      invoiceId,
      {
        approved,
        verifierId: user.userId,
        notes,
      },
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceOfferType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('invoice:offer')
  async generateInvoiceOffer(
    @CurrentTenant() tenantId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('idempotencyKey') idempotencyKey: string,
    @Args('requestedRecourseType', {
      type: () => RecourseTypeGql,
      nullable: true,
    })
    requestedRecourseType?: RecourseTypeGql,
  ): Promise<InvoiceOfferType> {
    this.logIdempotency('generateInvoiceOffer', idempotencyKey);
    const offer = await this.originationService.generateOffer(
      tenantId,
      invoiceId,
      {
        requestedRecourseType: requestedRecourseType as
          | RecourseType
          | undefined,
      },
    );
    return offer as unknown as InvoiceOfferType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('invoice:accept')
  async acceptInvoiceOffer(
    @CurrentTenant() tenantId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<InvoiceType> {
    return (await this.originationService.acceptOffer(
      tenantId,
      invoiceId,
      idempotencyKey,
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('invoice:decline')
  async declineInvoiceOffer(
    @CurrentTenant() tenantId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('idempotencyKey') idempotencyKey: string,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<InvoiceType> {
    this.logIdempotency('declineInvoiceOffer', idempotencyKey);
    return (await this.originationService.declineOffer(
      tenantId,
      invoiceId,
      reason,
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.DISBURSEMENT, AuditResourceType.CONTRACT)
  @Roles('invoice:fund')
  async disburseInvoiceAdvance(
    @CurrentTenant() tenantId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<InvoiceType> {
    return (await this.originationService.disburseAdvance(
      tenantId,
      invoiceId,
      idempotencyKey,
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('invoice:notify')
  async notifyInvoiceDebtor(
    @CurrentTenant() tenantId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<InvoiceType> {
    this.logIdempotency('notifyInvoiceDebtor', idempotencyKey);
    return (await this.originationService.notifyDebtor(
      tenantId,
      invoiceId,
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
  @Roles('invoice:payment')
  async recordInvoiceDebtorPayment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('input') input: RecordDebtorPaymentInput,
  ): Promise<InvoiceType> {
    return (await this.reserveService.recordDebtorPayment(tenantId, invoiceId, {
      amountReceived: input.amountReceived,
      paymentRef: input.paymentRef,
      idempotencyKey: input.idempotencyKey,
      operatorId: user.userId,
    })) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('invoice:release')
  async releaseInvoiceReserve(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<InvoiceType> {
    return (await this.reserveService.releaseReserve(tenantId, invoiceId, {
      idempotencyKey,
      operatorId: user.userId,
    })) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('invoice:dispute')
  async disputeInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<InvoiceType> {
    this.logIdempotency('disputeInvoice', idempotencyKey);
    return (await this.originationService.dispute(
      tenantId,
      invoiceId,
      reason,
      user.userId,
    )) as unknown as InvoiceType;
  }

  // ────── ResolveField (InvoiceType nested entities) ─────────────────────

  /**
   * S13-4: nested debtor resolver so the admin portal can render the debtor's
   * company name without an extra round-trip. N+1 is acceptable for v1 — the
   * invoices list is paginated to ≤ 20 items per page; DataLoader is a future
   * optimization.
   *
   * The TS method is named `resolveDebtor` to avoid colliding with the
   * top-level `debtor(debtorId)` query above; the GraphQL field is `debtor`
   * via the decorator's first argument (name).
   */
  @ResolveField('debtor', () => DebtorType, { nullable: true })
  async resolveDebtor(
    @Parent() invoice: InvoiceType,
  ): Promise<DebtorType | null> {
    if (!invoice.debtorId) return null;
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: invoice.debtorId, deletedAt: null },
    });
    return (debtor as unknown as DebtorType) ?? null;
  }

  /**
   * S13-4: nested seller resolver. The seller on a factoring invoice is the
   * Customer entity submitting the invoice (the SP's onboarded business).
   */
  @ResolveField('seller', () => CustomerType, { nullable: true })
  async resolveSeller(
    @Parent() invoice: InvoiceType,
  ): Promise<CustomerType | null> {
    if (!invoice.sellerId) return null;
    const customer = await this.prisma.customer.findFirst({
      where: { id: invoice.sellerId, deletedAt: null },
    });
    return (customer as unknown as CustomerType) ?? null;
  }

  // ────── Internals ──────────────────────────────────────────────────────

  private logIdempotency(mutation: string, key: string): void {
    if (key) {
      // Debug-level only — ledger-backed dedupe lands later in Sprint 12.
      // eslint-disable-next-line no-console
      console.debug(`[FactoringResolver] ${mutation} idempotencyKey=${key}`);
    }
  }
}

// Suppress unused-symbol warnings for enum mirrors that consumers may import
// from this resolver via ../types. They're re-imported here purely for type
// validation of the resolver method signatures.
void DebtorStatusGql;
void InvoiceStatusGql;
void NotFoundError;
void Int;
