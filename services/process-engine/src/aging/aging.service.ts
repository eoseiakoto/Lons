import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, ContractStatus, ContractClassification } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

interface AgingBucket {
  minDpd: number;
  maxDpd: number;
  status: ContractStatus;
  classification: ContractClassification;
}

const DEFAULT_BUCKETS: AgingBucket[] = [
  { minDpd: 0, maxDpd: 0, status: ContractStatus.performing, classification: ContractClassification.performing },
  { minDpd: 1, maxDpd: 7, status: ContractStatus.due, classification: ContractClassification.performing },
  { minDpd: 8, maxDpd: 30, status: ContractStatus.overdue, classification: ContractClassification.special_mention },
  { minDpd: 31, maxDpd: 60, status: ContractStatus.delinquent, classification: ContractClassification.substandard },
  { minDpd: 61, maxDpd: 90, status: ContractStatus.default_status, classification: ContractClassification.doubtful },
  { minDpd: 91, maxDpd: Number.MAX_SAFE_INTEGER, status: ContractStatus.default_status, classification: ContractClassification.loss },
];

@Injectable()
export class AgingService {
  private readonly logger = new Logger('AgingService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async classifyPortfolio(tenantId: string, date: Date) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: {
          in: [
            ContractStatus.active,
            ContractStatus.performing,
            ContractStatus.due,
            ContractStatus.overdue,
            ContractStatus.delinquent,
            ContractStatus.default_status,
          ],
        },
      },
      include: {
        repaymentSchedule: {
          where: { status: { in: ['pending', 'partial', 'overdue'] } },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
      },
    });

    const transitioned: { contractId: string; oldStatus: string; newStatus: string; dpd: number }[] = [];

    for (const contract of contracts) {
      const dpd = this.calculateDaysPastDue(contract, date);
      const bucket = this.getBucket(dpd);

      const oldStatus = contract.status;
      const oldClassification = contract.classification;

      if (contract.daysPastDue !== dpd || contract.status !== bucket.status || contract.classification !== bucket.classification) {
        await this.prisma.contract.update({
          where: { id: contract.id },
          data: {
            daysPastDue: dpd,
            status: bucket.status,
            classification: bucket.classification,
            ...(bucket.status === ContractStatus.default_status && !contract.defaultedAt
              ? { defaultedAt: date }
              : {}),
          },
        });

        if (oldStatus !== bucket.status) {
          transitioned.push({
            contractId: contract.id,
            oldStatus,
            newStatus: bucket.status,
            dpd,
          });

          this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
            contractId: contract.id,
            previousStatus: oldStatus,
            newStatus: bucket.status,
          });

          this.eventBus.emitAndBuild(EventType.CONTRACT_AGED, tenantId, {
            contractId: contract.id,
            daysPastDue: dpd,
            oldClassification,
            newClassification: bucket.classification,
          });
        }
      }
    }

    this.logger.log(`Aging complete: ${contracts.length} contracts processed, ${transitioned.length} transitioned`);
    return { processed: contracts.length, transitioned };
  }

  private calculateDaysPastDue(
    contract: { repaymentSchedule: { dueDate: Date }[] },
    asOfDate: Date,
  ): number {
    const earliestOverdue = contract.repaymentSchedule[0];
    if (!earliestOverdue) return 0;

    const dueDate = new Date(earliestOverdue.dueDate);
    if (asOfDate <= dueDate) return 0;

    return Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getBucket(dpd: number): AgingBucket {
    for (const bucket of DEFAULT_BUCKETS) {
      if (dpd >= bucket.minDpd && dpd <= bucket.maxDpd) {
        return bucket;
      }
    }
    return DEFAULT_BUCKETS[DEFAULT_BUCKETS.length - 1];
  }
}
