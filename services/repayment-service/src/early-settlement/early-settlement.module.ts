import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { EarlySettlementService } from './early-settlement.service';

/**
 * Sprint 16 (S16-9) — EarlySettlementService module.
 *
 * Read-only quote generator — no event bus, no listeners. Consumers
 * include the GraphQL `earlySettlementQuote` resolver and the
 * PaymentService (which can show the quote to the customer before
 * confirming a settlement payment).
 */
@Module({
  imports: [PrismaModule],
  providers: [EarlySettlementService],
  exports: [EarlySettlementService],
})
export class EarlySettlementModule {}
