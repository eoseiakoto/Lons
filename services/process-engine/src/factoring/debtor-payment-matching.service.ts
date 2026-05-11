import { Injectable, Logger } from '@nestjs/common';

import { PrismaService, InvoiceStatus } from '@lons/database';
import { EventBusService, computeSearchableHash } from '@lons/common';
import { AuditService } from '@lons/entity-service';
import {
  EventType,
  IDebtorPaymentMatchedEvent,
  IDebtorPaymentUnmatchedEvent,
} from '@lons/event-contracts';

import { ReserveService } from './reserve.service';

/**
 * S13B-1 / S13B-6: action labels emitted to the audit log when a webhook
 * payment lands. The S13B-6 `invoiceWebhookActivity` resolver filters on
 * these strings — keep them stable across releases.
 */
const AUDIT_ACTION_PAYMENT_MATCHED = 'match.debtorPayment';
const AUDIT_ACTION_PAYMENT_UNMATCHED = 'unmatch.debtorPayment';
const AUDIT_RESOURCE_INVOICE = 'invoice';

/**
 * Sprint 13 S13-1 — Inbound debtor-payment matching.
 *
 * Receives a parsed payment payload from the inbound webhook controller
 * (`apps/rest-server/src/debtor-payment-webhook/`) and attempts to match
 * the payment to an outstanding invoice using a waterfall strategy:
 *
 *   1. Exact match by `invoiceNumber` (+ tenant + currency).
 *   2. FIFO match by `debtorRef` — find the debtor (registration number,
 *      tax id, or internal UUID) and then their oldest outstanding invoice.
 *   3. No match → emit `DEBTOR_PAYMENT_UNMATCHED` for operator visibility;
 *      the admin portal manual `recordDebtorPayment` button is the fallback.
 *
 * On a match, this service delegates the actual application of the payment
 * to `ReserveService.recordDebtorPayment`, which already handles
 * full/partial logic, status transitions, ledger entries, reserve release
 * triggers, and debtor risk reassessment. Idempotency on duplicate webhooks
 * is enforced via `recordDebtorPayment`'s existing key check —
 * `transactionRef` is reused as the idempotency key, so replays short-circuit.
 */
@Injectable()
export class DebtorPaymentMatchingService {
  private readonly logger = new Logger('DebtorPaymentMatchingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly reserveService: ReserveService,
    private readonly auditService: AuditService,
  ) {}

  async matchAndApply(
    tenantId: string,
    payload: {
      transactionRef: string;
      amount: string;
      currency: string;
      invoiceNumber?: string;
      debtorRef?: string;
      paymentRef?: string;
      // S13B-1 / S13B-6: identifies the inbound payment provider (e.g. 'mtn-momo',
      // 'm-pesa') for the webhook activity audit feed. Optional so direct
      // (non-webhook) callers don't have to fabricate one.
      provider?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{
    matched: boolean;
    invoiceId?: string;
    matchStrategy?: 'invoice_number' | 'debtor_ref' | 'fifo';
    reason?: string;
  }> {
    // ── Strategy 1: exact invoice number match ───────────────────────────
    if (payload.invoiceNumber) {
      // First try a strict match including currency. If we find one — apply.
      const strict = await this.prisma.invoice.findFirst({
        where: {
          tenantId,
          invoiceNumber: payload.invoiceNumber,
          currency: payload.currency,
          status: {
            in: [
              InvoiceStatus.debtor_notified,
              InvoiceStatus.payment_received,
            ],
          },
        },
      });
      if (strict) {
        return this.apply(tenantId, strict.id, 'invoice_number', payload);
      }

      // No strict match — was there an invoice with this number but a
      // different currency? If so, surface as a currency mismatch (don't
      // silently fall through to debtorRef/FIFO).
      const currencyOnly = await this.prisma.invoice.findFirst({
        where: {
          tenantId,
          invoiceNumber: payload.invoiceNumber,
          status: {
            in: [
              InvoiceStatus.debtor_notified,
              InvoiceStatus.payment_received,
            ],
          },
        },
        select: { id: true, currency: true },
      });
      if (currencyOnly && currencyOnly.currency !== payload.currency) {
        this.logger.warn(
          `Debtor payment ${payload.transactionRef} found invoice ${payload.invoiceNumber} but currency mismatch: payment=${payload.currency} invoice=${currencyOnly.currency}`,
        );
        const evt: IDebtorPaymentUnmatchedEvent = {
          transactionRef: payload.transactionRef,
          amount: payload.amount,
          currency: payload.currency,
          reason: 'currency_mismatch',
        };
        this.eventBus.emitAndBuild(
          EventType.DEBTOR_PAYMENT_UNMATCHED,
          tenantId,
          evt,
        );
        // S13B-1 / S13B-6: scope the audit entry to the invoice that *would*
        // have matched if currency lined up — the operator's webhook-activity
        // panel can surface the failure on the correct invoice.
        await this.recordWebhookAudit(tenantId, currencyOnly.id, {
          action: AUDIT_ACTION_PAYMENT_UNMATCHED,
          payload,
          matchResult: 'currency_mismatch',
        });
        return { matched: false, reason: 'currency_mismatch' };
      }
      // Otherwise: invoice number not found → fall through to debtorRef/FIFO.
    }

    // ── Strategy 2: debtor ref + FIFO ────────────────────────────────────
    if (payload.debtorRef) {
      // S13B-2: `taxId` and `registrationNumber` are encrypted at rest.
      // Lookups go through their hash columns; the raw `id` UUID column
      // is unencrypted and stays a direct match.
      const refHash = computeSearchableHash(payload.debtorRef);
      const debtor = await this.prisma.debtor.findFirst({
        where: {
          tenantId,
          OR: [
            { registrationNumberHash: refHash },
            { taxIdHash: refHash },
            { id: payload.debtorRef },
          ],
        },
        select: { id: true },
      });
      if (debtor) {
        const oldest = await this.prisma.invoice.findFirst({
          where: {
            tenantId,
            debtorId: debtor.id,
            currency: payload.currency,
            status: {
              in: [
                InvoiceStatus.debtor_notified,
                InvoiceStatus.payment_received,
              ],
            },
          },
          orderBy: { dueDate: 'asc' },
        });
        if (oldest) {
          return this.apply(tenantId, oldest.id, 'fifo', payload);
        }
      }
      // No debtor or no outstanding invoice for that debtor → fall through.
    }

    // ── No match ─────────────────────────────────────────────────────────
    this.logger.warn(
      `Debtor payment ${payload.transactionRef} (${payload.amount} ${payload.currency}) could not be matched to any invoice (invoiceNumber=${payload.invoiceNumber ?? '-'}, debtorRef=${payload.debtorRef ?? '-'})`,
    );
    const evt: IDebtorPaymentUnmatchedEvent = {
      transactionRef: payload.transactionRef,
      amount: payload.amount,
      currency: payload.currency,
      reason: 'no_matching_invoice',
    };
    this.eventBus.emitAndBuild(
      EventType.DEBTOR_PAYMENT_UNMATCHED,
      tenantId,
      evt,
    );
    // S13B-1 / S13B-6: tenant-scoped audit entry with no resourceId — the
    // payment never landed on an invoice, so the webhook-activity feed can
    // only surface this through tenant-level filtering (it won't appear on
    // any invoice page, but it's preserved for compliance).
    await this.recordWebhookAudit(tenantId, undefined, {
      action: AUDIT_ACTION_PAYMENT_UNMATCHED,
      payload,
      matchResult: 'no_matching_invoice',
    });
    return { matched: false, reason: 'no_matching_invoice' };
  }

  /**
   * Common tail for a successful match: delegates to ReserveService,
   * emits MATCHED, and returns the result. ReserveService's existing
   * idempotency check on `idempotencyKey` covers duplicate webhooks.
   */
  private async apply(
    tenantId: string,
    invoiceId: string,
    matchStrategy: 'invoice_number' | 'debtor_ref' | 'fifo',
    payload: {
      transactionRef: string;
      amount: string;
      currency: string;
      provider?: string;
      paymentRef?: string;
    },
  ): Promise<{
    matched: true;
    invoiceId: string;
    matchStrategy: 'invoice_number' | 'debtor_ref' | 'fifo';
  }> {
    await this.reserveService.recordDebtorPayment(tenantId, invoiceId, {
      amountReceived: payload.amount,
      paymentRef: payload.transactionRef,
      operatorId: 'system:webhook',
      idempotencyKey: payload.transactionRef,
    });

    const evt: IDebtorPaymentMatchedEvent = {
      invoiceId,
      amount: payload.amount,
      currency: payload.currency,
      transactionRef: payload.transactionRef,
      matchStrategy,
    };
    this.eventBus.emitAndBuild(
      EventType.DEBTOR_PAYMENT_MATCHED,
      tenantId,
      evt,
    );

    // S13B-1 / S13B-6: persist the match outcome to the audit log so the
    // S13B-6 invoiceWebhookActivity resolver can render it. We rely on
    // ReserveService.recordDebtorPayment to handle ledger + state writes;
    // this entry is purely the webhook-activity record and is scoped to the
    // matched invoice id.
    await this.recordWebhookAudit(tenantId, invoiceId, {
      action: AUDIT_ACTION_PAYMENT_MATCHED,
      payload,
      matchResult: 'matched',
      matchStrategy,
    });

    this.logger.log(
      `Debtor payment ${payload.transactionRef} matched invoice ${invoiceId} via ${matchStrategy} (${payload.amount} ${payload.currency})`,
    );
    return { matched: true, invoiceId, matchStrategy };
  }

  /**
   * S13B-1 / S13B-6: write a webhook-activity audit entry. `auditService.log()`
   * already swallows errors internally, so this is fire-and-forget — never
   * lets an audit failure unwind the matching path.
   */
  private async recordWebhookAudit(
    tenantId: string,
    invoiceId: string | undefined,
    args: {
      action: typeof AUDIT_ACTION_PAYMENT_MATCHED | typeof AUDIT_ACTION_PAYMENT_UNMATCHED;
      payload: {
        transactionRef: string;
        amount: string;
        currency: string;
        provider?: string;
        invoiceNumber?: string;
        debtorRef?: string;
        paymentRef?: string;
      };
      matchResult:
        | 'matched'
        | 'no_matching_invoice'
        | 'currency_mismatch';
      matchStrategy?: 'invoice_number' | 'debtor_ref' | 'fifo';
    },
  ): Promise<void> {
    await this.auditService.log({
      tenantId,
      actorType: 'system',
      action: args.action,
      resourceType: AUDIT_RESOURCE_INVOICE,
      resourceId: invoiceId,
      correlationId: args.payload.transactionRef,
      metadata: {
        provider: args.payload.provider ?? null,
        transactionRef: args.payload.transactionRef,
        amount: args.payload.amount,
        currency: args.payload.currency,
        invoiceNumber: args.payload.invoiceNumber ?? null,
        debtorRef: args.payload.debtorRef ?? null,
        paymentRef: args.payload.paymentRef ?? null,
        matchResult: args.matchResult,
        matchStrategy: args.matchStrategy ?? null,
      },
    });
  }
}
