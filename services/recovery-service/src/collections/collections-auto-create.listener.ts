import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@lons/database';
import { EventType } from '@lons/event-contracts';
import { Prisma } from '@prisma/client';

import { CollectionsCaseService } from './collections-case.service';

/**
 * S19-5 — auto-open a collections case when the aging job classifies
 * a contract as past the per-tenant DPD threshold.
 *
 * Triggered by `EventType.CONTRACT_AGED` (already emitted by the
 * existing aging scheduler). Idempotent: skips if a non-deleted
 * case for the contract already exists.
 *
 * Reads the tenant's CollectionsWorkflowConfig.autoCaseCreationDpd
 * (default 30). Set to 0 in the config to disable auto-creation for
 * a tenant entirely — operators can then open cases manually only.
 */
interface ContractAgedEventData {
  contractId: string;
  customerId: string;
  daysOverdue: number;
  outstandingAmount: string;
  currency: string;
}

interface BaseEvent<T> {
  event: string;
  tenantId: string;
  timestamp: string;
  correlationId: string;
  data: T;
}

@Injectable()
export class CollectionsAutoCreateListener {
  private readonly logger = new Logger(CollectionsAutoCreateListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caseService: CollectionsCaseService,
  ) {}

  @OnEvent(EventType.CONTRACT_AGED)
  async onContractAged(event: BaseEvent<ContractAgedEventData>): Promise<void> {
    const { tenantId, data } = event;
    const { contractId, customerId, daysOverdue, outstandingAmount, currency } = data;

    // Enter tenant context so the workflow-config lookup + the
    // collections_cases write both pass RLS.
    await this.prisma.enterTenantContext({ tenantId }, async () => {
      const config = await this.prisma.collectionsWorkflowConfig.findUnique({
        where: { tenantId },
      });
      const threshold = config?.autoCaseCreationDpd ?? 30;
      // 0 disables auto-creation; threshold > daysOverdue means we're
      // not over the line yet.
      if (threshold === 0 || daysOverdue < threshold) return;

      try {
        await this.caseService.createCase(tenantId, {
          contractId,
          customerId,
          outstandingAmount: new Prisma.Decimal(outstandingAmount),
          currency,
          currentDpd: daysOverdue,
        });
        this.logger.log(
          `Auto-opened collections case for contract ${contractId} (DPD=${daysOverdue}, threshold=${threshold})`,
        );
      } catch (err) {
        // createCase throws ValidationError if a case already exists —
        // idempotent by design, swallow the duplicate signal.
        const message = (err as Error).message;
        if (message.includes('already exists')) return;
        this.logger.error(
          `Failed to auto-create collections case for contract ${contractId}: ${message}`,
        );
      }
    });
  }
}
