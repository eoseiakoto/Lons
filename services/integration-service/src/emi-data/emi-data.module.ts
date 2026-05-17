import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { EMI_DATA_ADAPTER } from './emi-data-adapter.interface';
import { MockEmiDataAdapter } from './mock-emi-data.adapter';
import { EmiDataService } from './emi-data.service';
import { EmiDataSyncJob } from './emi-data-sync.job';
import { EmiIntegrationConfigService } from './emi-integration-config.service';

/**
 * S17-1 / S17-2 — EMI integration module.
 *
 * Wires the default {@link MockEmiDataAdapter} against the
 * {@link EMI_DATA_ADAPTER} token. Real adapters (MTN MoMo data-pull,
 * M-Pesa data-pull, generic REST) can override this token at app level
 * via `useClass` / `useFactory`.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: EMI_DATA_ADAPTER, useClass: MockEmiDataAdapter },
    EmiDataService,
    EmiDataSyncJob,
    EmiIntegrationConfigService,
  ],
  exports: [
    EMI_DATA_ADAPTER,
    EmiDataService,
    EmiDataSyncJob,
    EmiIntegrationConfigService,
  ],
})
export class EmiDataModule {}
