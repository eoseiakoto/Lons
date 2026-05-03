/**
 * BNPL installment-schedule generator (Sprint 11 Track B / B6).
 *
 * Pure function — no I/O, no DB, no events. Given a purchase amount,
 * a number of installments, an interest rate, and timing config, it
 * returns the installment rows to persist. The caller (origination
 * service) wires `transactionId` and writes them.
 *
 * Rules (SPEC FR-BN-002):
 *   - Equal-split installments. The last installment absorbs any
 *     rounding remainder so the sum exactly equals `totalRepayable`.
 *   - First installment due on `today + firstInstallmentDeferralDays`
 *     (defaults 0 — first installment due at purchase). Subsequent
 *     installments cadence at `installmentIntervalDays` (default 30).
 *   - Interest is charged on the full purchase amount over the loan
 *     tenor (`numberOfInstallments * installmentIntervalDays / 365`).
 *     Zero-interest periods (`zeroInterestDays`) waive interest entirely
 *     when the *full tenor* fits within the window.
 *
 * Returns the schedule plus the computed `totalRepayable` and per-row
 * principal/interest splits for analytics.
 */

import {
  add,
  bankersRound,
  compare,
  divide,
  isPositive,
  multiply,
  subtract,
  toDecimal,
} from '@lons/common';

export interface InstallmentGenerationInput {
  /** Principal — the amount the merchant is being paid for. Decimal string. */
  purchaseAmount: string;
  /** Number of fixed installments (typically 3, 4, or 6). */
  numberOfInstallments: number;
  /** Annual interest rate as a decimal fraction. "0" for interest-free. */
  interestRate: string;
  /** Days between purchase and the first installment due date. Defaults to 0. */
  firstInstallmentDeferralDays?: number;
  /** Days between consecutive installments. Defaults to 30. */
  installmentIntervalDays?: number;
  /**
   * If the full tenor (numberOfInstallments × intervalDays) is within
   * this window, interest is waived entirely. Common promo: 90.
   */
  zeroInterestDays?: number;
  /** Anchor date — usually `new Date()` at the moment of purchase. */
  asOf: Date;
}

export interface InstallmentRow {
  installmentNumber: number;
  /** Decimal string. */
  amount: string;
  /** Decimal string. */
  principalPortion: string;
  /** Decimal string. */
  interestPortion: string;
  /** Decimal string. Reserved for future fee allocation. */
  feePortion: string;
  /** ISO 8601 date (no time component). */
  dueDate: Date;
}

export interface InstallmentScheduleResult {
  /** The installment rows in order. */
  installments: InstallmentRow[];
  /** Sum of `amount` across all rows — equals `purchaseAmount + interest`. */
  totalRepayable: string;
  /** Sum of `interestPortion`. */
  totalInterest: string;
}

const DEFAULT_INTERVAL_DAYS = 30;

/**
 * Build the installment schedule for one BNPL purchase.
 *
 * Throws if any input is structurally invalid (non-positive amount,
 * non-positive installment count, negative rate). The caller is expected
 * to have done business-rule validation (eligibility, product-config
 * bounds) before this is called.
 */
export function generateInstallmentSchedule(
  input: InstallmentGenerationInput,
): InstallmentScheduleResult {
  if (!isPositive(input.purchaseAmount)) {
    throw new Error(`purchaseAmount must be positive (got ${input.purchaseAmount})`);
  }
  if (!Number.isInteger(input.numberOfInstallments) || input.numberOfInstallments < 1) {
    throw new Error(
      `numberOfInstallments must be a positive integer (got ${input.numberOfInstallments})`,
    );
  }
  if (compare(input.interestRate, '0') < 0) {
    throw new Error(`interestRate must be non-negative (got ${input.interestRate})`);
  }

  const intervalDays = input.installmentIntervalDays ?? DEFAULT_INTERVAL_DAYS;
  const deferralDays = input.firstInstallmentDeferralDays ?? 0;
  const tenorDays = input.numberOfInstallments * intervalDays;

  const totalInterest = computeInterest(
    input.purchaseAmount,
    input.interestRate,
    tenorDays,
    input.zeroInterestDays,
  );
  const totalRepayable = add(input.purchaseAmount, totalInterest);

  // Equal split — the last row absorbs any rounding remainder so the
  // sum of `amount` exactly equals `totalRepayable`.
  const baseAmount = bankersRound(
    divide(totalRepayable, String(input.numberOfInstallments)),
    4,
  );
  const baseInterestPerRow = bankersRound(
    divide(totalInterest, String(input.numberOfInstallments)),
    4,
  );
  const basePrincipalPerRow = subtract(baseAmount, baseInterestPerRow);

  // Sum what the first (N-1) rows account for; the last row gets the
  // remainder so the total ties out exactly.
  const installmentsExceptLast = input.numberOfInstallments - 1;
  let runningAmount = '0';
  let runningInterest = '0';
  let runningPrincipal = '0';

  const installments: InstallmentRow[] = [];

  for (let i = 1; i <= input.numberOfInstallments; i++) {
    const isLast = i === input.numberOfInstallments;
    const amount = isLast
      ? subtract(totalRepayable, runningAmount)
      : baseAmount;
    const interestPortion = isLast
      ? subtract(totalInterest, runningInterest)
      : baseInterestPerRow;
    const principalPortion = isLast
      ? subtract(input.purchaseAmount, runningPrincipal)
      : basePrincipalPerRow;

    if (!isLast) {
      runningAmount = add(runningAmount, amount);
      runningInterest = add(runningInterest, interestPortion);
      runningPrincipal = add(runningPrincipal, principalPortion);
    }

    const dueDate = addDays(
      input.asOf,
      deferralDays + (i - 1) * intervalDays,
    );

    installments.push({
      installmentNumber: i,
      amount,
      principalPortion,
      interestPortion,
      // TODO (Sprint 12): populate from product.bnplConfig.installmentFee
      // when fee-bearing products are configured. Always '0' today.
      feePortion: '0',
      dueDate,
    });
  }

  return {
    installments,
    totalRepayable,
    totalInterest,
  };
}

/**
 * Compute total interest across the loan tenor. Returns `'0'` if the
 * tenor falls within the `zeroInterestDays` promo window.
 *
 * Formula: `purchaseAmount × annualRate × (tenorDays / 365)`. Done in a
 * single Decimal expression to avoid the precision loss that bit
 * `interest.service.ts` pre-A0 (Sprint 11).
 */
function computeInterest(
  purchaseAmount: string,
  annualRate: string,
  tenorDays: number,
  zeroInterestDays?: number,
): string {
  if (compare(annualRate, '0') === 0) return '0';
  if (zeroInterestDays !== undefined && tenorDays <= zeroInterestDays) return '0';

  const interest = toDecimal(purchaseAmount)
    .times(annualRate)
    .times(tenorDays)
    .dividedBy(365);
  return bankersRound(interest.toString(), 4);
}

function addDays(date: Date, days: number): Date {
  // Normalize to UTC midnight so installment dates don't drift across
  // DST or local-time offsets.
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// `multiply` import is intentional: kept for future fee-portion
// allocation when product config introduces a per-installment fee.
void multiply;
