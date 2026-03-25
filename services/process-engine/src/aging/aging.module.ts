import { Module } from '@nestjs/common';

import { AgingService } from './aging.service';

@Module({
  providers: [AgingService],
  exports: [AgingService],
})
export class AgingModule {}
