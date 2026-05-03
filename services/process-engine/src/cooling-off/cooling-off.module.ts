import { Module } from '@nestjs/common';

import { CoolingOffService } from './cooling-off.service';

@Module({
  providers: [CoolingOffService],
  exports: [CoolingOffService],
})
export class CoolingOffModule {}
