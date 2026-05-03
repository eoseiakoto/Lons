import { Module } from '@nestjs/common';

import { CreditLineModule } from './credit-line/credit-line.module';
import { DrawdownModule } from './drawdown/drawdown.module';
import { OverdraftRepaymentModule } from './repayment/repayment.module';
import { InterestModule } from './interest/interest.module';
import { CreditLineCacheModule } from './cache/credit-line-cache.module';
import { WalletAdaptersModule } from './wallet-adapters/wallet-adapters.module';
import { WalletConsumersModule } from './consumers/wallet-consumers.module';
import { OverdraftAgingModule } from './aging/aging.module';

/**
 * Top-level module for the overdraft service. Composed of:
 *   - `CreditLineModule` — activation, deactivation, status transitions
 *   - `DrawdownModule` — real-time drawdown flow
 *   - `OverdraftRepaymentModule` — auto + manual repayment with waterfall
 *   - `InterestModule` — daily interest + penalty accrual + cycle close
 *   - `CreditLineCacheModule` — Redis-backed cache for the hot path
 *
 * Wired into the main GraphQL/REST apps via `OverdraftServiceModule`. Per
 * Sprint 10A's RLS infrastructure, every entry point (resolver, controller,
 * BullMQ consumer) must run inside `prisma.enterTenantContext` so the
 * tenant_isolation policy admits the right rows. The interceptor in
 * `@lons/entity-service` handles HTTP requests automatically; queue
 * consumers must wrap manually (see `apps/scheduler` for the pattern).
 */
@Module({
  imports: [
    CreditLineCacheModule,
    CreditLineModule,
    DrawdownModule,
    OverdraftRepaymentModule,
    InterestModule,
    OverdraftAgingModule,
    WalletAdaptersModule.register(),
    WalletConsumersModule,
  ],
  exports: [
    CreditLineModule,
    DrawdownModule,
    OverdraftRepaymentModule,
    InterestModule,
    OverdraftAgingModule,
    CreditLineCacheModule,
    WalletAdaptersModule,
    WalletConsumersModule,
  ],
})
export class OverdraftServiceModule {}
