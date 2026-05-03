import { Module } from '@nestjs/common';

import { AnonymizationService } from './anonymization.service';

@Module({
  providers: [AnonymizationService],
  exports: [AnonymizationService],
})
export class AnonymizationModule {}
