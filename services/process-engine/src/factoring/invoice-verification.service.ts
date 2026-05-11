import { Injectable, Logger } from '@nestjs/common';

import { PrismaService, Prisma, InvoiceStatus } from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Sprint 14 (S14-IF-1) — Invoice verification queue + actions.
 *
 * Operators triage submitted invoices that have `verificationStatus =
 * 'pending'`. Each invoice can be:
 *   - claimed (single-operator assignment to prevent double-review),
 *   - approved (→ `verified`, triggers the existing offer-generation
 *     pipeline via the INVOICE_VERIFIED event),
 *   - rejected (→ `failed` verification + `rejected` status), or
 *   - sent back for more info (no status change; recorded in
 *     `metadata.infoRequests`).
 *
 * The `verificationStatus` and supporting columns already live on the
 * `Invoice` model (Sprint 12). This service adds the operational layer
 * on top — no new schema needed.
 */

export interface VerificationQueueFilters {
  sellerId?: string;
  debtorId?: string;
  minAmount?: string;
  maxAmount?: string;
  submittedAfter?: Date;
  submittedBefore?: Date;
  /** `'me'` (claimed by current user), `'unassigned'`, or undefined for all. */
  assignedTo?: 'me' | 'unassigned';
  /** Required when `assignedTo === 'me'` — injected by the resolver. */
  currentUserId?: string;
}

export interface VerificationPagination {
  first?: number;
  after?: string;
}

export type RejectInvoiceReason =
  | 'duplicate_invoice'
  | 'invalid_document'
  | 'debtor_not_verified'
  | 'amount_discrepancy'
  | 'other';

const REJECT_REASONS: readonly RejectInvoiceReason[] = [
  'duplicate_invoice',
  'invalid_document',
  'debtor_not_verified',
  'amount_discrepancy',
  'other',
] as const;

@Injectable()
export class InvoiceVerificationService {
  private readonly logger = new Logger(InvoiceVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Paginated queue of invoices awaiting verification. FIFO by
   * `createdAt` ascending so the oldest backlog item is processed first.
   */
  async getVerificationQueue(
    tenantId: string,
    filters: VerificationQueueFilters,
    pagination: VerificationPagination,
  ): Promise<{ items: unknown[]; nextCursor: string | null }> {
    const take = Math.min(pagination.first ?? 20, 100);

    // Invoices have no soft-delete column; they're never deleted from the
    // DB — they transition status through `cancelled` / `rejected` etc.
    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      verificationStatus: 'pending',
    };

    if (filters.sellerId) where.sellerId = filters.sellerId;
    if (filters.debtorId) where.debtorId = filters.debtorId;
    if (filters.minAmount || filters.maxAmount) {
      where.faceValue = {
        ...(filters.minAmount ? { gte: filters.minAmount } : {}),
        ...(filters.maxAmount ? { lte: filters.maxAmount } : {}),
      };
    }
    if (filters.submittedAfter || filters.submittedBefore) {
      where.createdAt = {
        ...(filters.submittedAfter ? { gte: filters.submittedAfter } : {}),
        ...(filters.submittedBefore ? { lte: filters.submittedBefore } : {}),
      };
    }
    if (filters.assignedTo === 'me') {
      if (!filters.currentUserId) {
        throw new ValidationError(
          'assignedTo="me" requires currentUserId — pass it from the resolver',
        );
      }
      where.verifiedBy = filters.currentUserId;
    } else if (filters.assignedTo === 'unassigned') {
      where.verifiedBy = null;
    }

    const items = await this.prisma.invoice.findMany({
      where,
      take: take + 1,
      ...(pagination.after
        ? { cursor: { id: pagination.after }, skip: 1 }
        : {}),
      orderBy: { createdAt: 'asc' },
    });

    const hasMore = items.length > take;
    const sliced = items.slice(0, take);

    return {
      items: sliced,
      nextCursor: hasMore ? sliced[sliced.length - 1].id : null,
    };
  }

  /**
   * Claim an invoice for review. Sets `verifiedBy` to the operator's
   * user id. Idempotent for the same user; raises a validation error
   * if another operator has already claimed it (no overrides — the
   * platform admin can re-assign via DB, intentionally cumbersome to
   * discourage cross-operator scope creep).
   */
  async claimInvoice(
    tenantId: string,
    invoiceId: string,
    userId: string,
  ): Promise<unknown> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, verificationStatus: 'pending' },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    if (invoice.verifiedBy === userId) {
      // No-op re-claim by the same operator.
      return invoice;
    }
    if (invoice.verifiedBy && invoice.verifiedBy !== userId) {
      // `ConflictError` semantically — but `ValidationError` gives
      // the existing GraphQL filter a clean code+details payload.
      throw new ValidationError(
        'Invoice already claimed by another operator',
        { invoiceId, claimedBy: invoice.verifiedBy },
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { verifiedBy: userId },
    });
  }

  /**
   * Approve an invoice. Transitions `verificationStatus → verified`
   * AND `status → verified`. Records `verifiedAt`, notes, and the
   * verification checklist into metadata. Emits `INVOICE_VERIFIED`
   * which triggers the existing offer-generation pipeline.
   */
  async approveInvoice(
    tenantId: string,
    invoiceId: string,
    userId: string,
    input: { notes?: string; checklist?: Record<string, boolean> },
  ): Promise<unknown> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, verificationStatus: 'pending' },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        verificationStatus: 'verified',
        status: InvoiceStatus.verified,
        verifiedBy: userId,
        verifiedAt: new Date(),
        verificationNotes: input.notes,
        metadata: {
          ...((invoice.metadata as Record<string, unknown>) ?? {}),
          verificationChecklist: input.checklist ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_VERIFIED, tenantId, {
      invoiceId,
      verifiedBy: userId,
      sellerId: invoice.sellerId,
      debtorId: invoice.debtorId,
      faceValue: String(invoice.faceValue),
    });

    return updated;
  }

  /**
   * Reject an invoice. The `reason` is required and must be one of the
   * canonical reject reasons — the admin portal renders these as a
   * dropdown so operators don't free-text them. The `INVOICE_REJECTED`
   * event drives the seller-facing notification.
   */
  async rejectInvoice(
    tenantId: string,
    invoiceId: string,
    userId: string,
    input: { reason: RejectInvoiceReason; notes?: string },
  ): Promise<unknown> {
    if (!REJECT_REASONS.includes(input.reason)) {
      throw new ValidationError(
        `reason must be one of: ${REJECT_REASONS.join(', ')}`,
        { reason: input.reason },
      );
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, verificationStatus: 'pending' },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        verificationStatus: 'failed',
        status: InvoiceStatus.rejected,
        verifiedBy: userId,
        verifiedAt: new Date(),
        verificationNotes: input.notes,
        metadata: {
          ...((invoice.metadata as Record<string, unknown>) ?? {}),
          rejectionReason: input.reason,
        } as Prisma.InputJsonValue,
      },
    });

    this.eventBus.emitAndBuild(EventType.INVOICE_REJECTED, tenantId, {
      invoiceId,
      rejectedBy: userId,
      reason: input.reason,
      sellerId: invoice.sellerId,
      debtorId: invoice.debtorId,
    });

    return updated;
  }

  /**
   * Request more information from the seller without changing the
   * invoice's verification state. Each request appends to
   * `metadata.infoRequests`; the seller-facing portal renders them in
   * a timeline.
   */
  async requestMoreInfo(
    tenantId: string,
    invoiceId: string,
    userId: string,
    message: string,
  ): Promise<unknown> {
    if (!message || message.trim().length === 0) {
      throw new ValidationError('Info request message is required');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const existing =
      ((invoice.metadata as Record<string, unknown>)?.infoRequests as
        | Array<Record<string, unknown>>
        | undefined) ?? [];
    const next = [
      ...existing,
      {
        requestedBy: userId,
        message,
        requestedAt: new Date().toISOString(),
      },
    ];

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        metadata: {
          ...((invoice.metadata as Record<string, unknown>) ?? {}),
          infoRequests: next,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
