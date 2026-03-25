import { Module } from '@nestjs/common';

import { PreQualificationService } from './pre-qualification.service';

@Module({
  providers: [PreQualificationService],
  exports: [PreQualificationService],
})
export class PreQualificationModule {}
