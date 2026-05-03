import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  EventType,
  IWalletBalanceInsufficientEvent,
} from '@lons/event-contracts';
import type { IBaseEvent } from '@lons/common';

import {
  WALLET_EVENTS_QUEUE,
  WALLET_JOB_CREDITED,
  WALLET_JOB_INSUFFICIENT,
  WalletCreditedJob,
  WalletInsufficientJob,
} from './wallet-event.types';

/**
 * Bridges in-process EventEmitter2 wallet events into the durable BullMQ
 * queue that `WalletEventConsumer` drains. The webhook controller emits
 * via `EventBusService.emitAndBuild()` (process-local); this listener
 * picks those events up and enqueues them so processing can be retried
 * on failure and survive a service restart.
 *
 * Retry policy: 3 attempts with exponential backoff (1s → 5s → 30s) per
 * SPEC §6.4 / §7.1 — wallet events are idempotent at the consumer (same
 * `transactionRef` won't double-charge) so retries are safe.
 */
@Injectable()
export class WalletEventListener {
  private readonly logger = new Logger('WalletEventListener');

  constructor(
    @InjectQueue(WALLET_EVENTS_QUEUE) private readonly queue: Queue,
  ) {}

  @OnEvent(EventType.WALLET_BALANCE_INSUFFICIENT)
  async onInsufficient(event: IBaseEvent<IWalletBalanceInsufficientEvent>): Promise<void> {
    const job: WalletInsufficientJob = {
      tenantId: event.tenantId,
      event: event.data,
    };
    await this.queue.add(WALLET_JOB_INSUFFICIENT, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: false,
      jobId: `insuff-${event.data.transactionRef}`,
    });
    this.logger.log(
      `Enqueued insufficient-balance job for tenant=${event.tenantId.slice(0, 8)}… ref=${event.data.transactionRef}`,
    );
  }

  @OnEvent(EventType.WALLET_BALANCE_CREDITED)
  async onCredited(event: IBaseEvent<WalletCreditedPayload>): Promise<void> {
    const job: WalletCreditedJob = {
      tenantId: event.tenantId,
      customerId: event.data.customerId,
      walletId: event.data.walletId,
      creditAmount: event.data.creditAmount,
      newBalance: event.data.newBalance,
      transactionRef: event.data.transactionRef,
      walletProvider: event.data.walletProvider,
    };
    await this.queue.add(WALLET_JOB_CREDITED, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: false,
      jobId: `cred-${event.data.transactionRef}`,
    });
    this.logger.log(
      `Enqueued wallet-credited job for tenant=${event.tenantId.slice(0, 8)}… ref=${event.data.transactionRef}`,
    );
  }
}

interface WalletCreditedPayload {
  customerId: string;
  walletId: string;
  creditAmount: string;
  newBalance: string;
  transactionRef: string;
  walletProvider: string;
}
