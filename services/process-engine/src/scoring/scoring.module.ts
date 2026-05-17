import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { ScoringService } from './scoring.service';
import { ScorecardConfigService } from './scorecard/scorecard-config.service';
import { CreditBureauFeatureExtractor } from './credit-bureau-feature.extractor';

@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [
    ScoringService,
    ScorecardConfigService,
    CreditBureauFeatureExtractor,
  ],
  exports: [
    ScoringService,
    ScorecardConfigService,
    CreditBureauFeatureExtractor,
  ],
})
export class ScoringModule {}
