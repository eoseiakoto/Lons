import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { WalletWebhookController } from './wallet-webhook.controller';

@Module({
  imports: [PrismaModule, EventBusModule],
  controllers: [WalletWebhookController],
})
export class WalletWebhookModule {}
