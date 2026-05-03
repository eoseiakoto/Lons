import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { DrawdownModule } from '../drawdown/drawdown.module';
import { OverdraftRepaymentModule } from '../repayment/repayment.module';
import { WalletAdaptersModule } from '../wallet-adapters/wallet-adapters.module';

import { WalletEventListener } from './wallet-event.listener';
import { WalletEventConsumer } from './wallet-event.consumer';
import { WALLET_EVENTS_QUEUE } from './wallet-event.types';

/**
 * Wires the wallet-event listener (EventEmitter2 → BullMQ bridge) and the
 * BullMQ consumer that drains the queue. Sprint 11 A8.
 *
 * Assumes the host app has already called `BullModule.forRoot(...)` —
 * `notification-service` does this when it's imported, so any app that
 * imports both modules is wired automatically. A standalone overdraft
 * worker app would need its own `BullModule.forRoot` registration.
 */
@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    DrawdownModule,
    OverdraftRepaymentModule,
    WalletAdaptersModule.register(),
    BullModule.registerQueue({
      name: WALLET_EVENTS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
  ],
  providers: [WalletEventListener, WalletEventConsumer],
  exports: [WalletEventListener, WalletEventConsumer, BullModule],
})
export class WalletConsumersModule {}
