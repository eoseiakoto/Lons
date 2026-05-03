import { Module } from '@nestjs/common';

import { PreQualificationService } from './pre-qualification.service';
import { ExposureModule } from '../exposure/exposure.module';

@Module({
  imports: [ExposureModule],
  providers: [PreQualificationService],
  exports: [PreQualificationService],
})
export class PreQualificationModule {}
