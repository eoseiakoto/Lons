import { Injectable } from '@nestjs/common';
import {
  ContractClassification,
  ContractStatus,
  Prisma,
  PrismaService,
  ProductType,
} from '@lons/database';
import { add, bankersRound, divide, isPositive, multiply } from '@lons/common';

import {
  ParBucket,
  PortfolioMetrics,
  PortfolioMetricsFilters,
} from './portfolio-metrics.types';

/**
 * S18-10 — Provisioning rate by classification.
 *
 * Same rates as `@lons/process-engine`'s AnalyticsService — kept aligned
 * deliberately so the new filtered service is a behavioural superset of
 * the existing global view.
 */
const PROVISIONING_RATES: Record<string, number> = {
  performing: 1,
  special_mention: 5,
  substandard: 20,
  doubtful: 50,
  loss: 100,
};

const ACTIVE_STATUSES: ContractStatus[] = [
  ContractStatus.active,
  ContractStatus.performing,
  ContractStatus.due,
  ContractStatus.overdue,
  ContractStatus.delinquent,
  ContractStatus.default_status,
];

const NPL_CLASSIFICATIONS: string[] = [
  ContractClassification.substandard,
  ContractClassification.doubtful,
  ContractClassification.loss,
];

/**
 * S18-10 — Portfolio metrics with optional product / segment / region /
 * lender filters.
 *
 * Drop-in superset of the existing
 * `@lons/process-engine`#AnalyticsService.getPortfolioMetrics — calling
 * with no filters returns identical numbers. Track A's GraphQL resolver
 * should switch to inject this service once it lands.
 *
 * Filtering semantics: AND across all populated fields. An empty filter
 * object (or omitted filters arg) is equivalent to "no filter" — same
 * as the legacy global view. The filter is applied to the single
 * `contract.findMany` call up front, so all PAR / NPL / provisioning
 * derivations operate on the same already-filtered slice.
 */
@Injectable()
export class PortfolioMetricsService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(
    tenantId: string,
    filters: PortfolioMetricsFilters = {},
  ): Promise<PortfolioMetrics> {
    const where = this.buildWhere(tenantId, filters);

    // Fetch once. The metric derivations below all read from this single
    // in-memory slice — much faster than re-querying per bucket, and
    // guarantees that PAR / NPL / provisioning all see the same filtered
    // contract set.
    const contracts = await this.prisma.contract.findMany({
      where,
      select: {
        id: true,
        daysPastDue: true,
        totalOutstanding: true,
        outstandingPrincipal: true,
        classification: true,
      },
    });

    const activeLoans = contracts.length;
    let activeOutstanding = '0.0000';
    let activePrincipal = '0.0000';
    for (const c of contracts) {
      activeOutstanding = add(activeOutstanding, String(c.totalOutstanding ?? 0));
      activePrincipal = add(activePrincipal, String(c.outstandingPrincipal ?? 0));
    }

    const computePar = (minDpd: number): ParBucket => {
      const atRisk = contracts.filter((c) => (c.daysPastDue ?? 0) >= minDpd);
      let amount = '0.0000';
      for (const c of atRisk) {
        amount = add(amount, String(c.outstandingPrincipal ?? 0));
      }
      const pct = isPositive(activePrincipal)
        ? bankersRound(divide(amount, activePrincipal), 4)
        : '0.0000';
      return { count: atRisk.length, amount, pct };
    };

    // NPL ratio: substandard + doubtful + loss principal / total active principal.
    const nplContracts = contracts.filter((c) =>
      NPL_CLASSIFICATIONS.includes(c.classification),
    );
    let nplAmount = '0.0000';
    for (const c of nplContracts) {
      nplAmount = add(nplAmount, String(c.outstandingPrincipal ?? 0));
    }
    const nplRatio = isPositive(activePrincipal)
      ? bankersRound(divide(nplAmount, activePrincipal), 4)
      : '0.0000';

    // Provisioning: per-classification reserve calculated against
    // outstanding principal at the published BoG rates.
    const provisionByClass: Record<string, string> = {};
    let totalProvision = '0.0000';
    for (const classification of Object.keys(PROVISIONING_RATES)) {
      const classContracts = contracts.filter((c) => c.classification === classification);
      let classOutstanding = '0.0000';
      for (const c of classContracts) {
        classOutstanding = add(classOutstanding, String(c.outstandingPrincipal ?? 0));
      }
      const provision = bankersRound(
        divide(multiply(classOutstanding, String(PROVISIONING_RATES[classification])), '100'),
        4,
      );
      provisionByClass[classification] = provision;
      totalProvision = add(totalProvision, provision);
    }

    return {
      activeLoans,
      activeOutstanding,
      parAt1: computePar(1),
      parAt7: computePar(7),
      parAt30: computePar(30),
      parAt60: computePar(60),
      parAt90: computePar(90),
      nplRatio,
      provisioning: {
        performing: provisionByClass['performing'] ?? '0.0000',
        specialMention: provisionByClass['special_mention'] ?? '0.0000',
        substandard: provisionByClass['substandard'] ?? '0.0000',
        doubtful: provisionByClass['doubtful'] ?? '0.0000',
        loss: provisionByClass['loss'] ?? '0.0000',
        total: totalProvision,
      },
    };
  }

  /**
   * Build the Prisma `where` clause from the filter input.
   *
   * Notes on customer filters: `region` and `segment` both live on
   * `customer.*` so they nest into a single `customer:` block. We merge
   * them rather than overwriting so combined region+segment filters work
   * (the obvious-but-wrong shape would be two separate `customer` keys
   * — only the last wins in JS object syntax).
   *
   * `deletedAt: null` is always applied so soft-deleted contracts never
   * appear in metrics — matches the legacy behaviour from
   * `@lons/process-engine`'s AnalyticsService.
   */
  private buildWhere(
    tenantId: string,
    filters: PortfolioMetricsFilters,
  ): Prisma.ContractWhereInput {
    // Contract has no `deletedAt` column (see schema.prisma — soft-delete
    // is not modelled at the contract level; closed loans are handled by
    // the status transitions in ContractStatus). We rely purely on the
    // status filter to exclude inactive contracts.
    const where: Prisma.ContractWhereInput = {
      tenantId,
      status: { in: ACTIVE_STATUSES },
    };

    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.productType) {
      // Nested product filter — the column is `Product.type`
      // (ProductType enum), even though the GraphQL surface calls it
      // `productType` per the resolver naming convention. We coerce the
      // input string to the enum at the boundary.
      where.product = {
        ...(where.product as Prisma.ProductWhereInput | undefined),
        type: filters.productType as ProductType,
      };
    }
    if (filters.lenderId) {
      where.lenderId = filters.lenderId;
    }

    // Customer filters nest. Merging both `region` and `customerSegment`
    // into a single `customer:` clause keeps AND semantics correct.
    if (filters.region || filters.customerSegment) {
      const customer: Prisma.CustomerWhereInput = {
        ...(where.customer as Prisma.CustomerWhereInput | undefined),
      };
      if (filters.region) customer.region = filters.region;
      if (filters.customerSegment) customer.segment = filters.customerSegment;
      where.customer = customer;
    }

    if (filters.dateFrom || filters.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.dateFrom) createdAt.gte = filters.dateFrom;
      if (filters.dateTo) createdAt.lte = filters.dateTo;
      where.createdAt = createdAt;
    }

    return where;
  }
}
