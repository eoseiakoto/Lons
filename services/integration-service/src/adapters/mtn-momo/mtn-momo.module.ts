import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventBusModule } from '@lons/common';
import { WebhookService } from '../../webhook/webhook.service';
import { MtnMomoAuthService } from './mtn-momo.auth';
import { MtnMomoAdapter } from './mtn-momo.adapter';
import { MtnMomoWebhookHandler } from './mtn-momo.webhook';

@Module({
  imports: [ConfigModule, EventBusModule],
  providers: [WebhookService, MtnMomoAuthService, MtnMomoAdapter, MtnMomoWebhookHandler],
  exports: [MtnMomoAuthService, MtnMomoAdapter, MtnMomoWebhookHandler],
})
export class MtnMomoModule {}
