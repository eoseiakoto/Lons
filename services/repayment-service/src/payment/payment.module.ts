import { Module } from '@nestjs/common';
import { WalletAdaptersModule } from '@lons/common';

import { PaymentService } from './payment.service';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [
    // Sprint 16 (S16-7): PaymentService now triggers schedule recalc on
    // early/advance payments. ScheduleModule exports the recalc service.
    ScheduleModule,
    // S17-FIX-3: registers SharedMockWalletCollectionAdapter under the
    // WALLET_COLLECTION_ADAPTER token. Phase 5 will supply a live adapter
    // via WalletAdaptersModule.register({ liveAdapters: [...] }).
    WalletAdaptersModule.register(),
  ],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
