import { Injectable, Logger } from '@nestjs/common';

import {
  Prisma,
  PrismaService,
  RepaymentScheduleEntry,
  RepaymentScheduleStatus,
} from '@lons/database';
import {
  NotFoundError,
  add,
  bankersRound,
  divide,
  multiply,
  subtract,
} from '@lons/common';

export type RecalculationTrigger =
  | 'early_payment'
  | 'penalty_applied'
  | 'restructuring';

/**
 * Sprint 16 (S16-7) — recalculate the remaining repayment schedule
 * after an early/advance payment or a penalty/fee event.
 *
 * Pattern:
 *   1. Snapshot the current schedule into `contract.metadata.scheduleHistory`
 *      (append-only, timestamped, with the trigger that caused the
 *      recalc).
 *   2. Compute remaining principal from `contract.outstandingPrincipal`.
 *   3. Redistribute it evenly across the remaining `pending|partial`
 *      installments. The last installment absorbs any rounding remainder.
 *   4. Recompute interest per installment at the contract's stored
 *      `interestRate` on the running principal (simple-monthly model:
 *      `monthlyRate = rate / 1200`).
 *   5. Persist the new amounts inside a single `$transaction` so the
 *      schedule never enters a half-updated state.
 *
 * Paid + waived installments are left untouched — they're history. The
 * recalc only touches FUTURE / partial installments.
 *
 * The interest model intentionally matches the rest of the codebase:
 * Decimal-as-string arithmetic, banker's rounding to 4dp. Property-based
 * tests on the financial helpers cover the rounding edge cases.
 */
@Injectable()
export class ScheduleRecalculationService {
  private readonly logger = new Logger(ScheduleRecalculationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recalculate the schedule for one contract. Returns the new schedule.
   * If there are no pending/partial installments left (everything is
   * paid or waived), the method is a no-op and returns the existing
   * schedule unchanged.
   */
  async recalculate(
    tenantId: string,
    contractId: string,
    trigger: RecalculationTrigger,
  ): Promise<RepaymentScheduleEntry[]> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: {
        repaymentSchedule: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const schedule = contract.repaymentSchedule;
    const pendingEntries = schedule.filter(
      (e) =>
        e.status === RepaymentScheduleStatus.pending ||
        e.status === RepaymentScheduleStatus.partial,
    );

    if (pendingEntries.length === 0) {
      this.logger.debug(
        `recalculate: contract ${contractId.slice(0, 8)}… has no pending installments; no-op`,
      );
      return schedule;
    }

    const remainingPrincipal = String(contract.outstandingPrincipal ?? '0');
    const interestRate = String(contract.interestRate ?? '0');

    // Snapshot BEFORE we mutate so the audit trail captures the
    // pre-recalc state. Pushed onto contract.metadata.scheduleHistory.
    const currentMetadata =
      (contract.metadata as Record<string, unknown>) ?? {};
    const scheduleHistory =
      (currentMetadata.scheduleHistory as unknown[]) ?? [];
    scheduleHistory.push({
      timestamp: new Date().toISOString(),
      trigger,
      originalSchedule: schedule.map((e) => ({
        installmentNumber: e.installmentNumber,
        principalAmount: String(e.principalAmount ?? '0'),
        interestAmount: String(e.interestAmount ?? '0'),
        feeAmount: String(e.feeAmount ?? '0'),
        totalAmount: String(e.totalAmount),
        status: e.status,
      })),
    });

    // Redistribute remaining principal evenly. The LAST installment
    // absorbs the rounding residual so the sum exactly matches
    // outstandingPrincipal.
    const numRemaining = pendingEntries.length;
    const evenPrincipal = bankersRound(
      divide(remainingPrincipal, String(numRemaining)),
      4,
    );

    // Simple-monthly interest accrual on the RUNNING principal balance.
    // (matches the convention used by `installment-generator.ts` in BNPL.)
    const monthlyRate = divide(interestRate, '1200');

    let runningPrincipal = remainingPrincipal;
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (let i = 0; i < pendingEntries.length; i++) {
      const entry = pendingEntries[i];
      const isLast = i === pendingEntries.length - 1;

      const principalPortion = isLast ? runningPrincipal : evenPrincipal;
      const interestPortion = bankersRound(
        multiply(runningPrincipal, monthlyRate),
        4,
      );
      const feeAmount = String(entry.feeAmount ?? '0');
      const totalAmount = bankersRound(
        add(add(principalPortion, interestPortion), feeAmount),
        4,
      );

      updates.push({
        id: entry.id,
        data: {
          principalAmount: principalPortion,
          interestAmount: interestPortion,
          totalAmount,
        },
      });

      runningPrincipal = subtract(runningPrincipal, principalPortion);
    }

    // Persist atomically — schedule writes + metadata snapshot must
    // commit together. If either fails we want a clean rollback.
    await this.prisma.$transaction([
      ...updates.map((u) =>
        this.prisma.repaymentScheduleEntry.update({
          where: { id: u.id },
          data: u.data,
        }),
      ),
      this.prisma.contract.update({
        where: { id: contractId },
        data: {
          metadata: {
            ...currentMetadata,
            scheduleHistory,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);

    return this.prisma.repaymentScheduleEntry.findMany({
      where: { contractId, tenantId },
      orderBy: { installmentNumber: 'asc' },
    });
  }
}
