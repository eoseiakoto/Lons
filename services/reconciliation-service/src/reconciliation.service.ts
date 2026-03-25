import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, DisbursementStatus, RepaymentStatus } from '@lons/database';
import { EventBusService, NotFoundError } from '@lons/common';
import { EventType } from '@lons/event-contracts';

interface InternalTransaction {
  id: string;
  type: 'disbursement' | 'repayment';
  amount: number;
  externalRef: string | null;
  date: Date;
  contractId: string;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger('ReconciliationService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async runDailyReconciliation(tenantId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Gather internal transactions
    const disbursements = await this.prisma.disbursement.findMany({
      where: { tenantId, status: DisbursementStatus.completed, completedAt: { gte: startOfDay, lte: endOfDay } },
    });

    const repayments = await this.prisma.repayment.findMany({
      where: { tenantId, status: RepaymentStatus.completed, completedAt: { gte: startOfDay, lte: endOfDay } },
    });

    const internalTxns: InternalTransaction[] = [
      ...disbursements.map((d) => ({
        id: d.id,
        type: 'disbursement' as const,
        amount: Number(d.amount),
        externalRef: d.externalRef,
        date: d.completedAt!,
        contractId: d.contractId,
      })),
      ...repayments.map((r) => ({
        id: r.id,
        type: 'repayment' as const,
        amount: Number(r.amount),
        externalRef: r.externalRef,
        date: r.completedAt!,
        contractId: r.contractId,
      })),
    ];

    // In Phase 3, we simulate external data as matching internal data
    // Real external data comes from wallet provider APIs in Phase 5
    const matchedCount = internalTxns.filter((t) => t.externalRef).length;
    const unmatchedCount = internalTxns.filter((t) => !t.externalRef).length;

    const reconciliationRun = await this.prisma.reconciliationRun.create({
      data: {
        tenantId,
        runDate: date,
        status: unmatchedCount > 0 ? 'with_exceptions' : 'completed',
        matchRate: internalTxns.length > 0 ? Number(((matchedCount / internalTxns.length) * 100).toFixed(2)) : 100,
        totalTxns: internalTxns.length,
        matchedTxns: matchedCount,
        exceptionCount: unmatchedCount,
      },
    });

    // Create exceptions for unmatched transactions
    for (const txn of internalTxns.filter((t) => !t.externalRef)) {
      await this.prisma.reconciliationException.create({
        data: {
          tenantId,
          txnType: txn.type,
          exceptionType: 'unmatched',
          severity: 'medium',
          amount: txn.amount,
          contractId: txn.contractId,
          description: `${txn.type} ${txn.id} has no external reference`,
          reconciliationRun: { connect: { id: reconciliationRun.id } },
        },
      });
    }

    this.eventBus.emitAndBuild(EventType.RECONCILIATION_COMPLETED, tenantId, {
      reconciliationRunId: reconciliationRun.id,
      date: date.toISOString(),
      totalTxns: internalTxns.length,
      matchedTxns: matchedCount,
      exceptions: unmatchedCount,
    });

    this.logger.log(`Reconciliation complete: ${internalTxns.length} txns, ${matchedCount} matched, ${unmatchedCount} exceptions`);

    return this.prisma.reconciliationRun.findUniqueOrThrow({
      where: { id: reconciliationRun.id },
      include: { exceptions: true },
    });
  }

  async resolveException(tenantId: string, exceptionId: string, investigation: string, resolvedBy: string) {
    const exception = await this.prisma.reconciliationException.findFirst({
      where: { id: exceptionId, tenantId },
    });
    if (!exception) throw new NotFoundError('ReconciliationException', exceptionId);

    return this.prisma.reconciliationException.update({
      where: { id: exceptionId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        investigation,
      },
    });
  }

  async getReconciliationRun(tenantId: string, runId: string) {
    const run = await this.prisma.reconciliationRun.findFirst({
      where: { id: runId, tenantId },
      include: { exceptions: true },
    });
    if (!run) throw new NotFoundError('ReconciliationRun', runId);
    return run;
  }

  async listReconciliationRuns(tenantId: string, take: number = 20, cursor?: string) {
    const items = await this.prisma.reconciliationRun.findMany({
      where: { tenantId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { runDate: 'desc' },
    });
    return { items: items.slice(0, take), hasMore: items.length > take };
  }
}
