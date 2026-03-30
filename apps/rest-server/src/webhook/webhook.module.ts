import { Module } from '@nestjs/common';
import { EntityServiceModule } from '@lons/entity-service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [EntityServiceModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
