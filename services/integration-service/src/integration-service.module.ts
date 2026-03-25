import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { MtnMomoAdapter } from './adapters/mtn-momo.adapter';
import { MpesaAdapter } from './adapters/mpesa.adapter';
import { CreditBureauService } from './credit-bureau/credit-bureau.service';
import { MockCreditBureauAdapter } from './credit-bureau/mock-credit-bureau.adapter';
import { CREDIT_BUREAU_ADAPTER } from './credit-bureau/credit-bureau.interface';
import { WebhookService } from './webhook/webhook.service';

@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [
    MtnMomoAdapter,
    MpesaAdapter,
    CreditBureauService,
    { provide: CREDIT_BUREAU_ADAPTER, useClass: MockCreditBureauAdapter },
    WebhookService,
  ],
  exports: [MtnMomoAdapter, MpesaAdapter, CreditBureauService, WebhookService],
})
export class IntegrationServiceModule {}
