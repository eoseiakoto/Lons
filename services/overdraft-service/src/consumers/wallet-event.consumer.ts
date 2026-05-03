import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { PrismaService, ProductType, CreditLineStatus } from '@lons/database';

import { DrawdownService, WALLET_DISBURSEMENT_ADAPTER, type WalletDisbursementAdapter } from '../drawdown/drawdown.service';
import { RepaymentService, WALLET_COLLECTION_ADAPTER, type WalletCollectionAdapter } from '../repayment/repayment.service';
import {
  WALLET_EVENTS_QUEUE,
  WALLET_JOB_CREDITED,
  WALLET_JOB_INSUFFICIENT,
  WalletCreditedJob,
  WalletInsufficientJob,
} from './wallet-event.types';

/**
 * Drains `overdraft-wallet-events` and dispatches each job to the
 * appropriate domain service. Required SPEC behaviours:
 *
 *   - Tenant context: every job re-enters `prisma.enterTenantContext` so
 *     RLS admits the right rows (matches `apps/scheduler` pattern).
 *   - Idempotency: BullMQ `jobId` is keyed off `transactionRef` so the
 *     same wallet event can't enqueue twice. The downstream services are
 *     also idempotent (drawdown checks for existing transactionRef; auto-
 *     repayment skips zero-owed lines).
 *   - Failure handling: a thrown error here trips BullMQ's retry/DLQ
 *     machinery (configured by the listener: 3 attempts, exponential
 *     backoff). After exhausted retries jobs land in `removeOnFail: false`
 *     state — a future ops dashboard can route those to the DLQ.
 */
@Processor(WALLET_EVENTS_QUEUE)
@Injectable()
export class WalletEventConsumer extends WorkerHost {
  private readonly logger = new Logger('WalletEventConsumer');

  constructor(
    private readonly prisma: PrismaService,
    private readonly drawdownService: DrawdownService,
    private readonly repaymentService: RepaymentService,
    @Optional() @Inject(WALLET_DISBURSEMENT_ADAPTER)
    private readonly disbursementAdapter?: WalletDisbursementAdapter,
    @Optional() @Inject(WALLET_COLLECTION_ADAPTER)
    private readonly collectionAdapter?: WalletCollectionAdapter,
  ) {
    super();
  }

  async process(job: Job<WalletInsufficientJob | WalletCreditedJob>): Promise<unknown> {
    if (job.name === WALLET_JOB_INSUFFICIENT) {
      return this.handleInsufficient(job.data as WalletInsufficientJob);
    }
    if (job.name === WALLET_JOB_CREDITED) {
      return this.handleCredited(job.data as WalletCreditedJob);
    }
    this.logger.warn(`Unknown job name: ${job.name}`);
    return { ignored: true };
  }

  private async handleInsufficient(data: WalletInsufficientJob) {
    if (!this.disbursementAdapter) {
      throw new Error('No WALLET_DISBURSEMENT_ADAPTER registered — cannot process drawdown');
    }
    return this.prisma.enterTenantContext({ tenantId: data.tenantId }, async () => {
      const productId = await this.findOverdraftProductForCustomer(
        data.tenantId,
        data.event.customerId,
      );
      if (!productId) {
        this.logger.warn(
          `No overdraft credit line for customer ${data.event.customerId.slice(0, 8)}… — skipping drawdown`,
        );
        return { skipped: 'no_credit_line' };
      }
      const decision = await this.drawdownService.processDrawdown(
        data.tenantId,
        data.event,
        productId,
        this.disbursementAdapter!,
      );
      this.logger.log(
        `Drawdown decision=${decision.status} for ref=${data.event.transactionRef}`,
      );
      return decision;
    });
  }

  private async handleCredited(data: WalletCreditedJob) {
    if (!this.collectionAdapter) {
      throw new Error('No WALLET_COLLECTION_ADAPTER registered — cannot process auto-repayment');
    }
    return this.prisma.enterTenantContext({ tenantId: data.tenantId }, async () => {
      const results = await this.repaymentService.processAutoRepayment(
        data.tenantId,
        {
          customerId: data.customerId,
          walletId: data.walletId,
          creditAmount: data.creditAmount,
        },
        this.collectionAdapter!,
      );
      this.logger.log(
        `Auto-repayment touched ${results.length} credit line(s) for ref=${data.transactionRef}`,
      );
      return { creditLines: results.length };
    });
  }

  /**
   * Find the active overdraft credit line for a customer in the current
   * tenant. Returns the productId (the drawdown service uses it to load
   * product config). If the customer has no active overdraft credit line,
   * returns null and the consumer logs + skips.
   */
  private async findOverdraftProductForCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<string | null> {
    const cl = await this.prisma.creditLine.findFirst({
      where: {
        tenantId,
        customerId,
        status: { in: [CreditLineStatus.active, CreditLineStatus.frozen] },
        product: { type: ProductType.overdraft },
      },
      select: { productId: true },
    });
    return cl?.productId ?? null;
  }
}
