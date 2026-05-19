import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { EMI_DATA_ADAPTER } from './emi-data-adapter.interface';
import { MockEmiDataAdapter } from './mock-emi-data.adapter';
import { EmiDataService } from './emi-data.service';
import { EmiDataSyncJob } from './emi-data-sync.job';
import { EmiIntegrationConfigService } from './emi-integration-config.service';
import {
  EMI_CACHE_TTL_MS,
  EMI_RETRY_OPTIONS,
  DEFAULT_EMI_CACHE_TTL_MS,
  DEFAULT_EMI_RETRY_OPTIONS,
} from './emi-data.constants';

/**
 * S17-1 / S17-2 — EMI integration module.
 *
 * Wires the default {@link MockEmiDataAdapter} against the
 * {@link EMI_DATA_ADAPTER} token. Real adapters (MTN MoMo data-pull,
 * M-Pesa data-pull, generic REST) can override this token at app level
 * via `useClass` / `useFactory`.
 */
@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [
    { provide: EMI_DATA_ADAPTER, useClass: MockEmiDataAdapter },
    // DE-NOTE-nestjs-runtime-crashes — primitive + plain-object
    // constructor params must be resolvable through explicit tokens.
    // Apps that need a different TTL/retry policy can re-provide these
    // tokens at the composition root.
    { provide: EMI_CACHE_TTL_MS, useValue: DEFAULT_EMI_CACHE_TTL_MS },
    { provide: EMI_RETRY_OPTIONS, useValue: DEFAULT_EMI_RETRY_OPTIONS },
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
