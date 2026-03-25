import { Injectable } from '@nestjs/common';
import { PrismaService, ContractStatus, ContractClassification } from '@lons/database';
import { add, divide, bankersRound } from '@lons/common';

export interface PortfolioMetrics {
  activeLoans: number;
  activeOutstanding: string;
  parAt1: { count: number; amount: string; pct: string };
  parAt7: { count: number; amount: string; pct: string };
  parAt30: { count: number; amount: string; pct: string };
  parAt60: { count: number; amount: string; pct: string };
  parAt90: { count: number; amount: string; pct: string };
  nplRatio: string;
  provisioning: {
    performing: string;
    specialMention: string;
    substandard: string;
    doubtful: string;
    loss: string;
    total: string;
  };
}

const PROVISIONING_RATES: Record<string, number> = {
  performing: 1,
  special_mention: 5,
  substandard: 20,
  doubtful: 50,
  loss: 100,
};

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getPortfolioMetrics(tenantId: string): Promise<PortfolioMetrics> {
    const activeStatuses = [
      ContractStatus.active,
      ContractStatus.performing,
      ContractStatus.due,
      ContractStatus.overdue,
      ContractStatus.delinquent,
      ContractStatus.default_status,
    ];

    const contracts = await this.prisma.contract.findMany({
      where: { tenantId, status: { in: activeStatuses } },
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
      activeOutstanding = add(activeOutstanding, String(c.totalOutstanding || 0));
      activePrincipal = add(activePrincipal, String(c.outstandingPrincipal || 0));
    }

    const computePar = (minDpd: number) => {
      const atRisk = contracts.filter((c) => c.daysPastDue >= minDpd);
      let amount = '0.0000';
      for (const c of atRisk) {
        amount = add(amount, String(c.outstandingPrincipal || 0));
      }
      const pct = Number(activePrincipal) > 0
        ? bankersRound(divide(amount, activePrincipal), 4)
        : '0.0000';
      return { count: atRisk.length, amount, pct };
    };

    // NPL: contracts classified as substandard, doubtful, or loss
    const nplClassifications: string[] = [ContractClassification.substandard, ContractClassification.doubtful, ContractClassification.loss];
    const nplContracts = contracts.filter((c) => nplClassifications.includes(c.classification));
    let nplAmount = '0.0000';
    for (const c of nplContracts) {
      nplAmount = add(nplAmount, String(c.outstandingPrincipal || 0));
    }
    const nplRatio = Number(activePrincipal) > 0
      ? bankersRound(divide(nplAmount, activePrincipal), 4)
      : '0.0000';

    // Provisioning
    const provisionByClass: Record<string, string> = {};
    let totalProvision = '0.0000';
    for (const classification of Object.keys(PROVISIONING_RATES)) {
      const classContracts = contracts.filter((c) => c.classification === classification);
      let classOutstanding = '0.0000';
      for (const c of classContracts) {
        classOutstanding = add(classOutstanding, String(c.outstandingPrincipal || 0));
      }
      const provision = bankersRound(
        divide(
          String(Number(classOutstanding) * PROVISIONING_RATES[classification]),
          '100',
        ),
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
        performing: provisionByClass['performing'] || '0.0000',
        specialMention: provisionByClass['special_mention'] || '0.0000',
        substandard: provisionByClass['substandard'] || '0.0000',
        doubtful: provisionByClass['doubtful'] || '0.0000',
        loss: provisionByClass['loss'] || '0.0000',
        total: totalProvision,
      },
    };
  }
}
