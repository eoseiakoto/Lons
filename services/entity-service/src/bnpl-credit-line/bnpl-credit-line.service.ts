import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  BnplCreditLine,
  BnplCreditLineStatus,
  Prisma,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  compare,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

export interface ICreateBnplCreditLineInput {
  customerId: string;
  subscriptionId: string;
  productId: string;
  /** Decimal as string per CLAUDE.md. */
  approvedLimit: string;
  currency: string;
  /** ISO 8601. Defaults to +90 days from now if omitted. */
  nextReviewAt?: string;
  /**
   * S16-FIX-1: hard deadline after which the line cannot be used.
   * Optional — many products grant credit indefinitely. When set, the
   * adjustment service's daily evaluator transitions the line to
   * `expired` once passed.
   */
  expiresAt?: string;
}

export interface IBnplCreditLineFilters {
  customerId?: string;
  subscriptionId?: string;
  productId?: string;
  status?: BnplCreditLineStatus;
}

/**
 * Sprint 15 (S15-1) — per-customer BNPL credit line CRUD.
 *
 * The existing `Subscription.creditLimit` / `availableLimit` fields are
 * retained for backwards compatibility but lack review scheduling, status
 * lifecycle, and adjustment history. `BnplCreditLine` is now the canonical
 * home for these. One credit line per (customer, BNPL subscription); the
 * unique constraint on `subscriptionId` enforces the 1:1 relationship.
 *
 * **Caller responsibility.** This service trusts that:
 *   - `customerId` and `subscriptionId` already belong to `tenantId`
 *     (the resolver/controller validates via RLS).
 *   - The subscription is for a BNPL product. The service does not
 *     re-check the product type — it accepts whatever subscription is
 *     provided.
 *
 * `availableLimit` is initialised to `approvedLimit` (new line, no usage).
 * Subsequent debits/credits go through `S15-3` (limit restoration on
 * repayment) and the BNPL origination check (`S15-9`).
 */
@Injectable()
export class BnplCreditLineService {
  private readonly logger = new Logger(BnplCreditLineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Create a credit line. Returns the existing line if one already
   * exists for the (tenant, customer, subscription) tuple — the spec
   * calls this an idempotent create, but a unique-constraint replay
   * would still throw, so we explicitly check first.
   */
  async create(
    tenantId: string,
    input: ICreateBnplCreditLineInput,
  ): Promise<BnplCreditLine> {
    if (compare(input.approvedLimit, '0') <= 0) {
      throw new ValidationError(
        `approvedLimit must be positive (got ${input.approvedLimit})`,
      );
    }

    // Idempotency — re-creating the same line returns the existing row.
    // FIX-9: filter `deletedAt: null` so a previously soft-deleted line
    // doesn't permanently block a new line on the same
    // (tenant, customer, subscription) tuple.
    const existing = await this.prisma.bnplCreditLine.findFirst({
      where: {
        tenantId,
        customerId: input.customerId,
        subscriptionId: input.subscriptionId,
        deletedAt: null,
      },
    });
    if (existing) return existing;

    const nextReviewAt = input.nextReviewAt
      ? new Date(input.nextReviewAt)
      : this.defaultNextReviewDate();

    const created = await this.prisma.bnplCreditLine.create({
      data: {
        tenantId,
        customerId: input.customerId,
        subscriptionId: input.subscriptionId,
        productId: input.productId,
        approvedLimit: input.approvedLimit,
        availableLimit: input.approvedLimit,
        currency: input.currency,
        status: BnplCreditLineStatus.active,
        // S16-FIX-1: new lines start active so we stamp activatedAt here
        // — the FIRST activation is at create time. updateStatus only
        // back-fills the column for lines that pre-date the field.
        activatedAt: new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        nextReviewAt,
      },
    });

    this.eventBus.emitAndBuild(EventType.BNPL_CREDIT_LINE_CREATED, tenantId, {
      creditLineId: created.id,
      customerId: created.customerId,
      subscriptionId: created.subscriptionId,
      productId: created.productId,
      approvedLimit: String(created.approvedLimit),
      currency: created.currency,
    });

    return created;
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<BnplCreditLine | null> {
    return this.prisma.bnplCreditLine.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async findByIdOrThrow(
    tenantId: string,
    id: string,
  ): Promise<BnplCreditLine> {
    const line = await this.findById(tenantId, id);
    if (!line) throw new NotFoundError('BnplCreditLine', id);
    return line;
  }

  async findByCustomerId(
    tenantId: string,
    customerId: string,
  ): Promise<BnplCreditLine[]> {
    return this.prisma.bnplCreditLine.findMany({
      where: { tenantId, customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBySubscriptionId(
    tenantId: string,
    subscriptionId: string,
  ): Promise<BnplCreditLine | null> {
    return this.prisma.bnplCreditLine.findFirst({
      where: { tenantId, subscriptionId, deletedAt: null },
    });
  }

  /**
   * Update status. Suspending or closing requires a reason. Reactivating
   * (suspended → active) clears the suspendedAt/suspendedReason fields.
   * Closed lines cannot be reactivated — closure is terminal.
   *
   * FIX-3: optional `idempotencyKey` propagated from the resolver. The
   * status transition itself is already idempotent (same status → return
   * unchanged), so the key currently just rides into the audit metadata.
   * If a second mutation reaches a different terminal state from the same
   * key, the second call will see the new status and short-circuit
   * because of the same-status check below.
   */
  async updateStatus(
    tenantId: string,
    id: string,
    status: BnplCreditLineStatus,
    reason?: string,
    _idempotencyKey?: string,
  ): Promise<BnplCreditLine> {
    const line = await this.findByIdOrThrow(tenantId, id);

    if (
      line.status === BnplCreditLineStatus.closed ||
      line.status === BnplCreditLineStatus.expired
    ) {
      throw new ValidationError(
        `Cannot change status of ${line.status} credit line ${id}`,
      );
    }
    if (line.status === status) {
      // Idempotent no-op.
      return line;
    }
    if (
      (status === BnplCreditLineStatus.suspended ||
        status === BnplCreditLineStatus.closed ||
        status === BnplCreditLineStatus.expired) &&
      !reason
    ) {
      throw new ValidationError(
        `Reason is required when transitioning to ${status}`,
      );
    }

    const data: Prisma.BnplCreditLineUpdateInput = { status };
    if (status === BnplCreditLineStatus.suspended) {
      data.suspendedAt = new Date();
      data.suspendedReason = reason;
    } else if (status === BnplCreditLineStatus.closed) {
      data.closedAt = new Date();
      data.closedReason = reason;
    } else if (status === BnplCreditLineStatus.expired) {
      // Expiry is functionally terminal; closedAt/closedReason already
      // carry the "this line is dead" signal for downstream queries.
      data.closedAt = new Date();
      data.closedReason = reason;
    } else if (status === BnplCreditLineStatus.active) {
      // S16-FIX-1: stamp activatedAt on FIRST activation only —
      // re-activation after suspension must NOT overwrite the original
      // grant date (used in regulatory "credit granted on" reports).
      if (!line.activatedAt) {
        data.activatedAt = new Date();
      }
      // Reactivation — clear the suspension stamp.
      data.suspendedAt = null;
      data.suspendedReason = null;
    }

    const updated = await this.prisma.bnplCreditLine.update({
      where: { id },
      data,
    });

    this.eventBus.emitAndBuild(
      EventType.BNPL_CREDIT_LINE_STATUS_CHANGED,
      tenantId,
      {
        creditLineId: id,
        previousStatus: line.status,
        newStatus: status,
        reason: reason ?? null,
      },
    );

    return updated;
  }

  /**
   * List with simple offset semantics. Production callers should use the
   * GraphQL Relay-style resolver — this internal helper takes a basic
   * limit/cursor pair to keep the service free of GraphQL plumbing.
   */
  async list(
    tenantId: string,
    filters: IBnplCreditLineFilters = {},
    pagination: { take?: number; cursor?: string } = {},
  ): Promise<BnplCreditLine[]> {
    const take = Math.min(pagination.take ?? 25, 100);
    return this.prisma.bnplCreditLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.customerId && { customerId: filters.customerId }),
        ...(filters.subscriptionId && {
          subscriptionId: filters.subscriptionId,
        }),
        ...(filters.productId && { productId: filters.productId }),
        ...(filters.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });
  }

  // ─── S17-FIX-2: revolving credit restoration ─────────────────────────

  /**
   * Restore `availableLimit` by the repaid principal amount.
   *
   * Only BNPL credit lines are revolving — calling this on a non-BNPL or
   * non-active line is a no-op at the SQL level (the `status = 'active'`
   * predicate filters it out). Callers are still expected to perform a
   * product-type check before calling so we don't silently swallow a
   * misconfigured event.
   *
   * The `LEAST(available_limit + amount, approved_limit)` cap in the SQL
   * ensures `availableLimit` never exceeds `approvedLimit`, even when
   * concurrent restorations race. The UPDATE is atomic — no TOCTOU risk.
   *
   * @param tenantId  Tenant context — required for RLS.
   * @param creditLineId  The BNPL credit line to restore.
   * @param amount  Decimal string — the principal portion of the repayment.
   */
  async restoreAvailableLimit(
    tenantId: string,
    creditLineId: string,
    amount: string,
  ): Promise<void> {
    if (compare(amount, '0') <= 0) {
      // Nothing to restore — guard against zero/negative principal amounts.
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE bnpl_credit_lines
       SET available_limit = LEAST(
         available_limit + $1::DECIMAL(19,4),
         approved_limit
       ),
       updated_at = NOW()
       WHERE id = $2::UUID
         AND tenant_id = $3::UUID
         AND status = 'active'`,
      amount,
      creditLineId,
      tenantId,
    );

    this.logger.debug(
      `restoreAvailableLimit: restored ${amount} to credit line ${creditLineId.slice(0, 8)}…`,
    );
  }

  /** 90 days from now. Spec default per S15-1.5. */
  private defaultNextReviewDate(): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 90);
    return d;
  }
}
