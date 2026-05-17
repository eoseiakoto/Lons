import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { MtnMomoAdapter } from './adapters/mtn-momo.adapter';
import { MpesaAdapter } from './adapters/mpesa.adapter';
import { WalletAdapterResolver } from './adapters/wallet-adapter-resolver.service';
import { CreditBureauService } from './credit-bureau/credit-bureau.service';
import { MockCreditBureauAdapter } from './credit-bureau/mock-credit-bureau.adapter';
import { CREDIT_BUREAU_ADAPTER } from './credit-bureau/credit-bureau.interface';
import { WebhookService } from './webhook/webhook.service';
import { ScreeningModule } from './screening/screening.module';
// Sprint 17 (S17-1 / S17-2) — EMI data-pull integration.
import { EmiDataModule } from './emi-data/emi-data.module';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    ObservabilityModule,
    ScreeningModule,
    EmiDataModule,
  ],
  providers: [
    MtnMomoAdapter,
    MpesaAdapter,
    WalletAdapterResolver,
    CreditBureauService,
    { provide: CREDIT_BUREAU_ADAPTER, useClass: MockCreditBureauAdapter },
    WebhookService,
  ],
  exports: [
    MtnMomoAdapter,
    MpesaAdapter,
    WalletAdapterResolver,
    CreditBureauService,
    WebhookService,
    ScreeningModule,
    EmiDataModule,
  ],
})
export class IntegrationServiceModule {}
