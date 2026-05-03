import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { MerchantService } from './merchant.service';

@Module({
  imports: [PrismaModule],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
