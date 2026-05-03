import { Module } from '@nestjs/common';
import { CreditLineCacheService } from './credit-line-cache.service';

@Module({
  providers: [CreditLineCacheService],
  exports: [CreditLineCacheService],
})
export class CreditLineCacheModule {}
