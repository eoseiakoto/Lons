import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@lons/database';
import { EventBusService, AuditActionType, AuditResourceType } from '@lons/common';
import { AuditService } from '@lons/entity-service';
import { EventType } from '@lons/event-contracts';

/**
 * S19-7 / FR-DM-003.2 — automatic NPL suspension + credit bureau
 * reporting.
 *
 * Listens for two upstream events:
 *   - CONTRACT_AGED                — the aging job classifies a
 *                                    contract as doubtful / loss /
 *                                    npl. Suspend the borrower +
 *                                    queue a negative bureau report.
 *   - CREDITLINE_NPL_CLASSIFIED    — same flow for revolving lines
 *                                    (overdraft, BNPL credit lines).
 *
 * Idempotency: re-suspending an already-suspended customer is a
 * no-op. updateMany on subscriptions / credit lines is naturally
 * idempotent (re-flipping active → suspended for a row that's
 * already suspended just touches zero rows).
 *
 * Consent: credit bureau reporting is gated on a non-revoked
 * `credit_reporting` consent. Missing consent → log + skip the
 * report. The suspension still applies — that's an internal action,
 * not a third-party data disclosure.
 *
 * PII: all log lines use masked identifiers (sourceId, classification)
 * — no customer ID, phone, or email surfaces in the log stream
 * per CLAUDE.md §6.
 */

interface ContractAgedEventData {
  contractId: string;
  customerId: string;
  daysOverdue: number;
  outstandingAmount: string;
  currency: string;
  /** Aging job emits 'performing' | 'special_mention' | 'substandard' | 'doubtful' | 'loss'. */
  classification?: string;
}

interface CreditLineNplEventData {
  creditLineId: string;
  customerId: string;
}

interface BaseEvent<T> {
  event: string;
  tenantId: string;
  timestamp: string;
  correlationId: string;
  data: T;
}

@Injectable()
export class NplSuspensionListener {
  private readonly logger = new Logger(NplSuspensionListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly auditService: AuditService,
  ) {}

  @OnEvent(EventType.CONTRACT_AGED)
  async onContractAged(event: BaseEvent<ContractAgedEventData>): Promise<void> {
    const { tenantId, data } = event;
    // Only act on NPL classifications. 'special_mention' and
    // 'substandard' are early-warning states and don't trigger
    // suspension per CLAUDE.md / the recovery spec.
    if (!data.classification || !['doubtful', 'loss', 'npl'].includes(data.classification)) {
      return;
    }
    await this.prisma.enterTenantContext({ tenantId }, async () => {
      await this.suspendBorrower(tenantId, data.customerId, data.contractId, data.classification!);
      await this.triggerCreditBureauReport(
        tenantId, data.customerId, data.contractId, data.classification!,
      );
    });
  }

  @OnEvent(EventType.CREDITLINE_NPL_CLASSIFIED)
  async onCreditLineNpl(event: BaseEvent<CreditLineNplEventData>): Promise<void> {
    const { tenantId, data } = event;
    await this.prisma.enterTenantContext({ tenantId }, async () => {
      await this.suspendBorrower(tenantId, data.customerId, data.creditLineId, 'npl');
      await this.triggerCreditBureauReport(tenantId, data.customerId, data.creditLineId, 'npl');
    });
  }

  /**
   * Mark the customer suspended + freeze any active subscriptions
   * and credit lines they hold. Idempotent.
   */
  private async suspendBorrower(
    tenantId: string,
    customerId: string,
    sourceId: string,
    classification: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { status: true, metadata: true },
    });
    if (!customer) {
      this.logger.warn(`NPL suspend: customer not found (id=***${customerId.slice(-4)})`);
      return;
    }
    // Already suspended → nothing to do. Idempotent re-delivery is safe.
    if (customer.status === 'suspended' || customer.status === 'blacklisted') {
      return;
    }

    const meta = (customer.metadata as Record<string, unknown> | null) ?? {};
    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        status: 'suspended',
        metadata: {
          ...meta,
          suspendedReason: 'npl_auto_suspension',
          suspendedAt: new Date().toISOString(),
          suspendedByContract: sourceId,
          suspendedClassification: classification,
        },
      },
    });

    // Suspend active subscriptions — prevents new loan origination.
    const subRes = await this.prisma.subscription.updateMany({
      where: { tenantId, customerId, status: 'active' },
      data: { status: 'suspended' },
    });

    // Freeze active credit lines — caps drawdowns, allows existing
    // installments to continue paying down.
    const clRes = await this.prisma.creditLine.updateMany({
      where: { tenantId, customerId, status: { in: ['active'] } },
      data: { status: 'frozen', frozenAt: new Date(), frozenReason: 'npl_auto_suspension' },
    });

    this.eventBus.emitAndBuild(EventType.COLLECTIONS_NPL_SUSPENDED, tenantId, {
      customerId,
      sourceId,
      classification,
      suspendedSubscriptions: subRes.count,
      frozenCreditLines: clRes.count,
    });

    await this.auditService.log({
      tenantId,
      action: AuditActionType.UPDATE,
      resourceType: AuditResourceType.CUSTOMER,
      resourceId: customerId,
      actorId: undefined,
      actorType: 'system',
      metadata: {
        reason: 'npl_auto_suspension',
        sourceId,
        classification,
        suspendedSubscriptions: subRes.count,
        frozenCreditLines: clRes.count,
      },
    });

    this.logger.warn(
      `NPL auto-suspended customer ***${customerId.slice(-4)} ` +
        `(classification=${classification}, source=${sourceId}, ` +
        `subs=${subRes.count}, creditLines=${clRes.count})`,
    );
  }

  /**
   * Emit a credit bureau negative-report event IF the customer has
   * granted credit_reporting consent. The integration service picks
   * up the event and routes to the configured bureau adapter.
   */
  private async triggerCreditBureauReport(
    tenantId: string,
    customerId: string,
    contractId: string,
    classification: string,
  ): Promise<void> {
    const consent = await this.prisma.customerConsent.findFirst({
      where: {
        customerId,
        consentType: 'credit_reporting',
        granted: true,
        revokedAt: null,
      },
    });
    if (!consent) {
      this.logger.warn(
        `Skipping bureau report for ***${customerId.slice(-4)} — no credit_reporting consent`,
      );
      return;
    }
    this.eventBus.emitAndBuild(EventType.COLLECTIONS_CREDIT_BUREAU_REPORTED, tenantId, {
      customerId,
      contractId,
      reportType: 'negative',
      classification,
      reason: `NPL classification: ${classification}`,
    });
  }
}
