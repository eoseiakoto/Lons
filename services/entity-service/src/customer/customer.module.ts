import { Module } from '@nestjs/common';

import { CustomerService } from './customer.service';
import { CustomerConsentService } from './customer-consent.service';

@Module({
  providers: [CustomerService, CustomerConsentService],
  exports: [CustomerService, CustomerConsentService],
})
export class CustomerModule {}
