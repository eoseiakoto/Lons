import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma, LedgerEntryType, DebitCredit } from '@lons/database';
import { ValidationError, add, subtract, isZero, isNegative, bankersRound } from '@lons/common';

/**
 * Double-Entry Ledger Engine
 *
 * IMMUTABILITY CONTRACT: This service provides NO update or delete methods.
 * Ledger entries are append-only. Corrections are made via reversal entries
 * that reference the original. This is enforced at the service layer.
 */

interface RecordEntryParams {
  contractId: string;
  entryType: LedgerEntryType;
  amount: string;
  currency: string;
  effectiveDate: Date;
  valueDate: Date;
  description?: string;
  referenceType?: string;
  referenceId?: string;
}

interface StatementResult {
  openingBalance: string;
  closingBalance: string;
  entries: Array<{
    id: string;
    entryType: LedgerEntryType;
    debitCredit: DebitCredit;
    amount: string;
    runningBalance: string;
    effectiveDate: Date;
    description: string | null;
  }>;
  summary: {
    totalDebits: string;
    totalCredits: string;
    netMovement: string;
  };
}

/**
 * Maps entry types to their debit/credit semantics.
 * Debit increases the contract's outstanding balance (money owed TO the platform).
 * Credit decreases the contract's outstanding balance (money received FROM the borrower).
 */
const ENTRY_TYPE_DEBIT_CREDIT: Record<LedgerEntryType, { debit: string; credit: string }> = {
  disbursement: { debit: 'Loan receivable', credit: 'Cash/Wallet outflow' },
  repayment: { debit: 'Cash/Wallet inflow', credit: 'Loan receivable reduction' },
  interest_accrual: { debit: 'Interest receivable', credit: 'Interest income' },
  fee: { debit: 'Fee receivable', credit: 'Fee income' },
  penalty: { debit: 'Penalty receivable', credit: 'Penalty income' },
  write_off: { debit: 'Write-off expense', credit: 'Loan receivable reduction' },
  adjustment: { debit: 'Adjustment debit', credit: 'Adjustment credit' },
  reversal: { debit: 'Reversal debit', credit: 'Reversal credit' },
};

@Injectable()
export class LedgerService {
  private readonly logger = new Logger('LedgerService');

  constructor(private prisma: PrismaService) {}

  /**
   * Records a double-entry pair for a financial event.
   * Creates exactly 2 ledger entries (1 debit + 1 credit) in a serializable transaction.
   * Both entries share the same referenceId for pairing.
   */
  async recordDoubleEntry(tenantId: string, params: RecordEntryParams) {
    const { contractId, entryType, amount, currency, effectiveDate, valueDate, description, referenceType, referenceId } = params;

    if (isZero(amount)) {
      throw new ValidationError('Ledger entry amount cannot be zero');
    }
    if (isNegative(amount)) {
      throw new ValidationError('Ledger entry amount cannot be negative');
    }

    const roundedAmount = bankersRound(amount, 4);
    const labels = ENTRY_TYPE_DEBIT_CREDIT[entryType];

    return this.prisma.$transaction(async (tx) => {
      // Get the current running balance for this contract
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { contractId },
        orderBy: { createdAt: 'desc' },
        select: { runningBalance: true },
      });

      const previousBalance = lastEntry
        ? bankersRound(String(lastEntry.runningBalance), 4)
        : '0.0000';

      // Calculate new running balance based on entry type
      // Debits (disbursement, interest_accrual, fee, penalty) increase outstanding
      // Credits (repayment, write_off) decrease outstanding
      // For double-entry, only the NET effect matters on the running balance
      const balanceEffect = this.getBalanceEffect(entryType, roundedAmount);
      const newRunningBalance = bankersRound(add(previousBalance, balanceEffect), 4);

      // Create the DEBIT entry
      const debitEntry = await tx.ledgerEntry.create({
        data: {
          tenantId,
          entryType,
          debitCredit: DebitCredit.debit,
          amount: new Prisma.Decimal(roundedAmount),
          currency,
          runningBalance: new Prisma.Decimal(newRunningBalance),
          effectiveDate,
          valueDate,
          description: description || labels.debit,
          referenceType: referenceType || entryType,
          referenceId,
          contract: { connect: { id: contractId } },
        },
      });

      // Create the CREDIT entry (same amount, opposite side, same running balance snapshot)
      const creditEntry = await tx.ledgerEntry.create({
        data: {
          tenantId,
          entryType,
          debitCredit: DebitCredit.credit,
          amount: new Prisma.Decimal(roundedAmount),
          currency,
          runningBalance: new Prisma.Decimal(newRunningBalance),
          effectiveDate,
          valueDate,
          description: description || labels.credit,
          referenceType: referenceType || entryType,
          referenceId: referenceId || debitEntry.id,
          contract: { connect: { id: contractId } },
        },
      });

      this.logger.debug(`Double-entry recorded: ${entryType} ${roundedAmount} ${currency} for contract ${contractId}`);

      return { debitEntry, creditEntry, runningBalance: newRunningBalance };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  /**
   * Records a reversal of an existing ledger entry pair.
   * Creates a new double-entry pair with opposite balance effect, referencing the original.
   */
  async recordReversal(tenantId: string, originalEntryId: string, reason: string) {
    const original = await this.prisma.ledgerEntry.findFirst({
      where: { id: originalEntryId, tenantId, debitCredit: DebitCredit.debit },
    });

    if (!original) {
      throw new ValidationError(`Original debit entry ${originalEntryId} not found`);
    }

    // Determine the reversed entry type — a reversal of a debit-increasing entry
    // will have opposite balance effect
    const reversedEntryType = original.entryType as LedgerEntryType;

    return this.recordDoubleEntry(tenantId, {
      contractId: original.contractId,
      entryType: LedgerEntryType.reversal,
      amount: bankersRound(String(original.amount), 4),
      currency: original.currency,
      effectiveDate: new Date(),
      valueDate: new Date(),
      description: `Reversal of ${reversedEntryType}: ${reason}`,
      referenceType: 'reversal',
      referenceId: originalEntryId,
    });
  }

  /**
   * Returns the current running balance for a contract.
   */
  async getRunningBalance(contractId: string): Promise<string> {
    const lastEntry = await this.prisma.ledgerEntry.findFirst({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
      select: { runningBalance: true },
    });

    return lastEntry ? bankersRound(String(lastEntry.runningBalance), 4) : '0.0000';
  }

  /**
   * Generates a statement for a contract within a date range.
   * Returns opening balance, all transactions, closing balance, and summary totals.
   */
  async generateStatement(contractId: string, fromDate: Date, toDate: Date): Promise<StatementResult> {
    // Opening balance: last entry BEFORE fromDate
    const openingEntry = await this.prisma.ledgerEntry.findFirst({
      where: {
        contractId,
        effectiveDate: { lt: fromDate },
        debitCredit: DebitCredit.debit, // Use debit entries for balance tracking
      },
      orderBy: { createdAt: 'desc' },
      select: { runningBalance: true },
    });

    const openingBalance = openingEntry
      ? bankersRound(String(openingEntry.runningBalance), 4)
      : '0.0000';

    // All entries in the date range (both debit and credit for full picture)
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        contractId,
        effectiveDate: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
    });

    // Closing balance: last debit entry ON or BEFORE toDate
    const closingEntry = await this.prisma.ledgerEntry.findFirst({
      where: {
        contractId,
        effectiveDate: { lte: toDate },
        debitCredit: DebitCredit.debit,
      },
      orderBy: { createdAt: 'desc' },
      select: { runningBalance: true },
    });

    const closingBalance = closingEntry
      ? bankersRound(String(closingEntry.runningBalance), 4)
      : openingBalance;

    // Summary totals
    let totalDebits = '0.0000';
    let totalCredits = '0.0000';

    for (const entry of entries) {
      if (entry.debitCredit === DebitCredit.debit) {
        totalDebits = add(totalDebits, bankersRound(String(entry.amount), 4));
      } else {
        totalCredits = add(totalCredits, bankersRound(String(entry.amount), 4));
      }
    }

    return {
      openingBalance,
      closingBalance,
      entries: entries.map((e) => ({
        id: e.id,
        entryType: e.entryType as LedgerEntryType,
        debitCredit: e.debitCredit as DebitCredit,
        amount: bankersRound(String(e.amount), 4),
        runningBalance: bankersRound(String(e.runningBalance), 4),
        effectiveDate: e.effectiveDate,
        description: e.description,
      })),
      summary: {
        totalDebits,
        totalCredits,
        netMovement: subtract(totalDebits, totalCredits),
      },
    };
  }

  /**
   * Verifies the integrity of a contract's ledger by recomputing
   * running balance from scratch. Returns mismatch info if any.
   */
  async verifyBalance(contractId: string): Promise<{ valid: boolean; expectedBalance: string; actualBalance: string; mismatches: string[] }> {
    const allDebits = await this.prisma.ledgerEntry.findMany({
      where: { contractId, debitCredit: DebitCredit.debit },
      orderBy: { createdAt: 'asc' },
    });

    let computedBalance = '0.0000';
    const mismatches: string[] = [];

    for (const entry of allDebits) {
      const effect = this.getBalanceEffect(entry.entryType as LedgerEntryType, bankersRound(String(entry.amount), 4));
      computedBalance = bankersRound(add(computedBalance, effect), 4);

      const storedBalance = bankersRound(String(entry.runningBalance), 4);
      if (computedBalance !== storedBalance) {
        mismatches.push(`Entry ${entry.id}: expected ${computedBalance}, stored ${storedBalance}`);
      }
    }

    const lastEntry = await this.prisma.ledgerEntry.findFirst({
      where: { contractId, debitCredit: DebitCredit.debit },
      orderBy: { createdAt: 'desc' },
      select: { runningBalance: true },
    });

    const actualBalance = lastEntry ? bankersRound(String(lastEntry.runningBalance), 4) : '0.0000';

    return {
      valid: mismatches.length === 0,
      expectedBalance: computedBalance,
      actualBalance,
      mismatches,
    };
  }

  /**
   * Determines the net effect on running balance for an entry type.
   * Positive = increases outstanding (money owed to platform).
   * Negative = decreases outstanding (money received or written off).
   */
  private getBalanceEffect(entryType: LedgerEntryType, amount: string): string {
    switch (entryType) {
      // These INCREASE the outstanding balance
      case LedgerEntryType.disbursement:
      case LedgerEntryType.interest_accrual:
      case LedgerEntryType.fee:
      case LedgerEntryType.penalty:
        return amount;

      // These DECREASE the outstanding balance
      case LedgerEntryType.repayment:
      case LedgerEntryType.write_off:
        return subtract('0', amount); // negate

      // Reversals have OPPOSITE effect of what they reverse
      // Since we don't know the original type here, reversals DECREASE balance
      // (most reversals reverse charges, reducing what's owed)
      case LedgerEntryType.reversal:
        return subtract('0', amount);

      // Adjustments can go either way — treat as increase by default
      case LedgerEntryType.adjustment:
        return amount;

      default:
        return amount;
    }
  }
}
