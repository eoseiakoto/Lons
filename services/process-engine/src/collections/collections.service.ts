import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, ContractStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async getCollectionsQueue(tenantId: string, sortBy: 'amount' | 'dpd' = 'dpd', take: number = 20, cursor?: string) {
    const orderBy: Prisma.ContractOrderByWithRelationInput = sortBy === 'amount'
      ? { totalOutstanding: 'desc' }
      : { daysPastDue: 'desc' };

    const items = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: [ContractStatus.overdue, ContractStatus.delinquent, ContractStatus.default_status] },
      },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy,
      include: {
        customer: true,
        product: true,
        collectionsActions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return { items: items.slice(0, take), hasMore: items.length > take };
  }

  async logAction(tenantId: string, contractId: string, actionType: string, notes: string, actorId?: string, promiseDate?: Date) {
    const action = await this.prisma.collectionsAction.create({
      data: {
        tenantId,
        actionType,
        notes,
        actorId,
        promiseDate,
        contract: { connect: { id: contractId } },
      },
    });

    this.eventBus.emitAndBuild(EventType.COLLECTIONS_ACTION_LOGGED, tenantId, {
      contractId,
      actionType,
      actionId: action.id,
    });

    return action;
  }

  async getActionsForContract(tenantId: string, contractId: string) {
    return this.prisma.collectionsAction.findMany({
      where: { tenantId, contractId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCollectionsMetrics(tenantId: string) {
    const overdueCount = await this.prisma.contract.count({
      where: { tenantId, status: ContractStatus.overdue },
    });
    const delinquentCount = await this.prisma.contract.count({
      where: { tenantId, status: ContractStatus.delinquent },
    });
    const defaultCount = await this.prisma.contract.count({
      where: { tenantId, status: ContractStatus.default_status },
    });

    const totalActions = await this.prisma.collectionsAction.count({
      where: { tenantId },
    });

    return {
      overdueCount,
      delinquentCount,
      defaultCount,
      totalInCollections: overdueCount + delinquentCount + defaultCount,
      totalActions,
    };
  }
}
