import { Injectable, Logger } from '@nestjs/common';

import { ContractStatus, PrismaService, Product } from '@lons/database';
import {
  NotFoundError,
  ValidationError,
  add,
  bankersRound,
  compare,
  divide,
  multiply,
  subtract,
} from '@lons/common';

import {
  DEFAULT_EARLY_SETTLEMENT_CONFIG,
  IEarlySettlementBreakdownItem,
  IEarlySettlementConfig,
  IEarlySettlementQuote,
} from './early-settlement.types';

/**
 * Sprint 16 (S16-9) — early settlement quote service.
 *
 * Generates a "settle now" quote with full Decimal-arithmetic breakdown:
 *   - outstanding principal + accrued interest + outstanding fees /
 *     penalties = base owed
 *   - interest rebate = unearned interest × rebate%
 *   - settlement fee = flat amount OR % of remaining principal
 *   - total = base owed − rebate + fee
 *
 * Config lives on `product.feeStructure.earlySettlement`. Defaults
 * (DEFAULT_EARLY_SETTLEMENT_CONFIG) give "allowed but no rebate, no
 * fee" so legacy products with empty config still permit early payoff
 * at the full owed amount.
 *
 * The service never writes — it's a quote generator only. Actual
 * payment posting goes through the standard PaymentService path,
 * which is responsible for triggering ScheduleRecalculationService
 * (S16-7) on settlement.
 *
 * Money is Decimal-as-string throughout (CLAUDE.md).
 */
@Injectable()
export class EarlySettlementService {
  private readonly logger = new Logger(EarlySettlementService.name);
  /** Statuses where early settlement is impossible. */
  private static readonly TERMINAL_STATUSES: ContractStatus[] = [
    ContractStatus.settled,
    ContractStatus.cancelled,
    ContractStatus.written_off,
  ];

  constructor(private readonly prisma: PrismaService) {}

  async calculateEarlySettlementAmount(
    tenantId: string,
    contractId: string,
  ): Promise<IEarlySettlementQuote> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: {
        product: true,
        repaymentSchedule: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    if (EarlySettlementService.TERMINAL_STATUSES.includes(contract.status)) {
      throw new ValidationError(
        `Contract is ${contract.status} — not eligible for early settlement`,
        { code: 'EARLY_SETTLEMENT_TERMINAL_STATUS' },
      );
    }

    const config = this.getEarlySettlementConfig(contract.product);

    if (!config.allowed) {
      throw new ValidationError(
        'Early settlement is not allowed for this product',
        { code: 'EARLY_SETTLEMENT_NOT_ALLOWED' },
      );
    }

    // Minimum remaining tenor check — measured in days from today to
    // the contract's maturity. Floor on the divide so partial-day
    // boundaries don't squeak past the gate.
    const today = new Date();
    const maturity = new Date(contract.maturityDate);
    const remainingDays = Math.floor(
      (maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (remainingDays < config.minRemainingDays) {
      throw new ValidationError(
        `Early settlement requires at least ${config.minRemainingDays} remaining days; current is ${remainingDays}`,
        {
          code: 'EARLY_SETTLEMENT_TOO_SOON',
          minRemainingDays: config.minRemainingDays,
          remainingDays,
        },
      );
    }

    const remainingPrincipal = String(contract.outstandingPrincipal ?? '0');
    const accruedInterest = String(contract.outstandingInterest ?? '0');
    const outstandingFees = String(contract.outstandingFees ?? '0');
    const outstandingPenalties = String(contract.outstandingPenalties ?? '0');

    // Unearned interest = sum of interest on future PENDING installments
    // whose dueDate is strictly after today. These haven't accrued yet —
    // they're the bucket eligible for rebate.
    const futureInstallments = contract.repaymentSchedule.filter(
      (e) => e.status === 'pending' && new Date(e.dueDate) > today,
    );
    let unearnedInterest = '0.0000';
    for (const inst of futureInstallments) {
      unearnedInterest = add(unearnedInterest, String(inst.interestAmount ?? '0'));
    }

    // interestRebate = unearnedInterest × (rebatePercent / 100), banker's-rounded.
    const interestRebate = bankersRound(
      divide(
        multiply(unearnedInterest, config.interestRebatePercent),
        '100',
      ),
      4,
    );

    // Settlement fee — flat or percentage of remaining principal.
    const settlementFee =
      config.settlementFeeType === 'flat'
        ? bankersRound(config.settlementFeeValue, 4)
        : bankersRound(
            divide(
              multiply(remainingPrincipal, config.settlementFeeValue),
              '100',
            ),
            4,
          );

    // total = (principal + interest + fees + penalties + settlementFee) − rebate
    const subtotal = add(
      add(
        add(remainingPrincipal, accruedInterest),
        add(outstandingFees, outstandingPenalties),
      ),
      settlementFee,
    );
    let totalSettlementAmount = bankersRound(
      subtract(subtotal, interestRebate),
      4,
    );

    // S17-FIX-BA-5 (S16 carry-forward) — floor at zero. A 100% rebate
    // on a contract where unearned interest exceeds the outstanding
    // balance would otherwise produce a negative settlement quote —
    // an obligation to PAY the customer to settle, which is
    // commercially nonsensical. The breakdown still carries the
    // rebate line for transparency.
    if (compare(totalSettlementAmount, '0') < 0) {
      totalSettlementAmount = '0.0000';
    }

    // Quote validity — end of current UTC day. The customer must
    // re-quote tomorrow because outstanding amounts change with
    // interest accrual.
    const validUntil = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    ).toISOString();

    const rawBreakdown: IEarlySettlementBreakdownItem[] = [
      { label: 'Remaining principal', amount: remainingPrincipal, type: 'debit' as const },
      { label: 'Accrued interest', amount: accruedInterest, type: 'debit' as const },
      { label: 'Outstanding fees', amount: outstandingFees, type: 'debit' as const },
      { label: 'Outstanding penalties', amount: outstandingPenalties, type: 'debit' as const },
      { label: 'Interest rebate', amount: interestRebate, type: 'credit' as const },
      { label: 'Early settlement fee', amount: settlementFee, type: 'debit' as const },
    ];
    const breakdown = rawBreakdown.filter(
      (item) => compare(item.amount, '0') > 0,
    );

    return {
      contractId,
      remainingPrincipal,
      accruedInterest,
      interestRebate,
      settlementFee,
      totalSettlementAmount,
      validUntil,
      breakdown,
    };
  }

  /**
   * Pull early-settlement config from `product.feeStructure.earlySettlement`,
   * filling in defaults for missing fields. Never throws — a malformed
   * JSON blob just gets the defaults, so a stale product config can't
   * brick the quote endpoint.
   */
  private getEarlySettlementConfig(product: Product): IEarlySettlementConfig {
    const fee = (product.feeStructure as Record<string, unknown> | null) ?? {};
    const raw = fee.earlySettlement as Partial<IEarlySettlementConfig> | undefined;
    if (!raw) return DEFAULT_EARLY_SETTLEMENT_CONFIG;
    return {
      allowed:
        typeof raw.allowed === 'boolean'
          ? raw.allowed
          : DEFAULT_EARLY_SETTLEMENT_CONFIG.allowed,
      interestRebatePercent:
        typeof raw.interestRebatePercent === 'string'
          ? raw.interestRebatePercent
          : typeof raw.interestRebatePercent === 'number'
            ? String(raw.interestRebatePercent)
            : DEFAULT_EARLY_SETTLEMENT_CONFIG.interestRebatePercent,
      settlementFeeType:
        raw.settlementFeeType === 'percentage' ? 'percentage' : 'flat',
      settlementFeeValue:
        typeof raw.settlementFeeValue === 'string'
          ? raw.settlementFeeValue
          : typeof raw.settlementFeeValue === 'number'
            ? String(raw.settlementFeeValue)
            : DEFAULT_EARLY_SETTLEMENT_CONFIG.settlementFeeValue,
      minRemainingDays:
        typeof raw.minRemainingDays === 'number' && raw.minRemainingDays >= 0
          ? Math.floor(raw.minRemainingDays)
          : DEFAULT_EARLY_SETTLEMENT_CONFIG.minRemainingDays,
    };
  }
}
