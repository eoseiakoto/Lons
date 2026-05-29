import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';
import { AuditModule } from '@lons/entity-service';

import { NplSuspensionListener } from './npl-suspension.listener';
import { NplReinstatementService } from './npl-reinstatement.service';

/**
 * S19-7 — NPL auto-suspension + reinstatement.
 *
 * The listener is registered as a provider so NestJS's
 * @nestjs/event-emitter discovers its @OnEvent handlers at boot.
 * The reinstatement service is exported for resolver use.
 */
@Module({
  imports: [PrismaModule, EventBusModule, AuditModule],
  providers: [NplSuspensionListener, NplReinstatementService],
  exports: [NplReinstatementService],
})
export class NplModule {}
