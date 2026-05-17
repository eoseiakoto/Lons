import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { RevenueDistributionService } from './revenue-distribution.service';
import { PercentageSplitStrategy } from './strategies/percentage-split.strategy';
import { TieredStrategy } from './strategies/tiered.strategy';
import { FixedFeeStrategy } from './strategies/fixed-fee.strategy';
import { WaterfallStrategy } from './strategies/waterfall.strategy';

/**
 * S18-9 — Revenue distribution module.
 *
 * Wires the four model strategies + the dispatcher so the settlement
 * pipeline (and Track A's GraphQL resolver, once added) can inject
 * {@link RevenueDistributionService} without having to know which model
 * is configured per tenant.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    PercentageSplitStrategy,
    TieredStrategy,
    FixedFeeStrategy,
    WaterfallStrategy,
    RevenueDistributionService,
  ],
  exports: [RevenueDistributionService],
})
export class RevenueDistributionModule {}
