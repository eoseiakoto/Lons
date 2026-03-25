import { Module } from '@nestjs/common';

import { LoanRequestModule } from '../loan-request/loan-request.module';
import { OfferService } from './offer.service';

@Module({
  imports: [LoanRequestModule],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
