import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, ContractStatus } from '@lons/database';
import { EventBusService, multiply, divide, bankersRound, add } from '@lons/common';
import { EventType } from '@lons/event-contracts';

@Injectable()
export class InterestAccrualService {
  private readonly logger = new Logger('InterestAccrualService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async accrueForDate(tenantId: string, date: Date) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: [ContractStatus.active, ContractStatus.performing, ContractStatus.due, ContractStatus.overdue] },
      },
      include: { product: true },
    });

    let processedCount = 0;
    let totalAccrued = '0.0000';
    const errors: { contractId: string; error: string }[] = [];

    for (const contract of contracts) {
      try {
        // Skip if in grace period
        if (contract.startDate > date) continue;
        const gracePeriodEnd = new Date(contract.startDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + (contract.product.gracePeriodDays || 0));
        if (date < gracePeriodEnd) continue;

        // Skip zero-interest contracts
        if (!contract.interestRate || Number(contract.interestRate) === 0) continue;

        const dailyAccrual = this.calculateDailyAccrual(contract);
        if (dailyAccrual === '0.0000') continue;

        await this.applyAccrual(tenantId, contract.id, dailyAccrual, date);
        totalAccrued = add(totalAccrued, dailyAccrual);
        processedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ contractId: contract.id, error: message });
        this.logger.error(`Accrual failed for contract ${contract.id}: ${message}`);
      }
    }

    this.logger.log(`Interest accrual complete: ${processedCount} contracts, ${totalAccrued} total accrued`);
    return { processedCount, totalAccrued, errors };
  }

  calculateDailyAccrual(contract: { outstandingPrincipal: any; interestRate: any; product: { interestRateModel: string } }): string {
    const principal = String(contract.outstandingPrincipal || 0);
    const annualRate = String(contract.interestRate || 0);

    if (contract.product.interestRateModel === 'flat') {
      // Flat: daily = principal * annualRate / 365 / 100
      return bankersRound(divide(multiply(principal, annualRate), '36500'), 4);
    }

    // Reducing balance: daily = outstandingPrincipal * annualRate / 365 / 100
    return bankersRound(divide(multiply(principal, annualRate), '36500'), 4);
  }

  private async applyAccrual(tenantId: string, contractId: string, amount: string, date: Date) {
    const contract = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId } });

    const newOutstandingInterest = add(String(contract.outstandingInterest || 0), amount);
    const newTotalOutstanding = add(
      add(String(contract.outstandingPrincipal || 0), newOutstandingInterest),
      add(String(contract.outstandingFees || 0), String(contract.outstandingPenalties || 0)),
    );

    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        outstandingInterest: Number(newOutstandingInterest),
        totalOutstanding: Number(newTotalOutstanding),
      },
    });

    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        entryType: 'interest_accrual',
        debitCredit: 'debit',
        amount: Number(amount),
        currency: contract.currency,
        runningBalance: Number(newTotalOutstanding),
        effectiveDate: date,
        valueDate: date,
        description: `Daily interest accrual: ${amount} ${contract.currency}`,
        contract: { connect: { id: contractId } },
      },
    });

    this.eventBus.emitAndBuild(EventType.INTEREST_ACCRUED, tenantId, {
      contractId,
      amount,
      date: date.toISOString(),
    });
  }
}
