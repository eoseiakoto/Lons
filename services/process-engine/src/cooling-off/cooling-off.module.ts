import { Module } from '@nestjs/common';
import { AuditModule } from '@lons/entity-service';

import { CoolingOffService } from './cooling-off.service';

@Module({
  // S13B-1: AuditService is required for system-actor entries on
  // automatic cooling_off → active transitions.
  imports: [AuditModule],
  providers: [CoolingOffService],
  exports: [CoolingOffService],
})
export class CoolingOffModule {}
