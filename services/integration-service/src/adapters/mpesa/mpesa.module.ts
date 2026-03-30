import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventBusModule } from '@lons/common';
import { WebhookService } from '../../webhook/webhook.service';
import { MpesaAuthService } from './mpesa.auth';
import { MpesaAdapter } from './mpesa.adapter';
import { MpesaWebhookHandler } from './mpesa.webhook';

@Module({
  imports: [ConfigModule, EventBusModule],
  providers: [WebhookService, MpesaAuthService, MpesaAdapter, MpesaWebhookHandler],
  exports: [MpesaAuthService, MpesaAdapter, MpesaWebhookHandler],
})
export class MpesaModule {}
