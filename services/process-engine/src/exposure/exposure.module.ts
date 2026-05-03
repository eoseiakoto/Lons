import { Module } from '@nestjs/common';

import { ExposureService } from './exposure.service';

@Module({
  providers: [ExposureService],
  exports: [ExposureService],
})
export class ExposureModule {}
