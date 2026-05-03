import { Resolver, Query, Args, ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { PrismaService } from '@lons/database';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { add, divide, bankersRound, subtract, compare } from '@lons/common';

// ─── Disbursement Report Types ───

@ObjectType()
class DisbursementReportEntry {
  @Field()
  date!: string;

  @Field()
  product!: string;

  @Field(() => Int)
  count!: number;

  @Field()
  amount!: string;

  @Field()
  avgTicket!: string;
}

@ObjectType()
class DisbursementReportTotals {
  @Field(() => Int)
  totalCount!: number;

  @Field()
  totalAmount!: string;

  @Field()
  avgTicket!: string;
}

@ObjectType()
class DisbursementReportType {
  @Field(() => [DisbursementReportEntry])
  entries!: DisbursementReportEntry[];

  @Field(() => DisbursementReportTotals)
  totals!: DisbursementReportTotals;
}

// ─── Repayment Report Types ───

@ObjectType()
class RepaymentReportEntry {
  @Field()
  date!: string;

  @Field()
  totalCollected!: string;

  @Field()
  principal!: string;

  @Field()
  interest!: string;

  @Field()
  fees!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
class RepaymentReportTotals {
  @Field()
  totalCollected!: string;

  @Field()
  principal!: string;

  @Field()
  interest!: string;

  @Field()
  fees!: string;

  @Field(() => Int)
  totalCount!: number;
}

@ObjectType()
class RepaymentReportType {
  @Field(() => [RepaymentReportEntry])
  entries!: RepaymentReportEntry[];

  @Field(() => RepaymentReportTotals)
  totals!: RepaymentReportTotals;
}

// ─── Customer Acquisition Report Types ───

@ObjectType()
class CustomerAcquisitionEntry {
  @Field()
  period!: string;

  @Field(() => Int)
  newCustomers!: number;

  @Field(() => Int)
  kycCompleted!: number;

  @Field(() => Int)
  firstLoan!: number;

  @Field()
  conversionRate!: string;
}

@ObjectType()
class CustomerAcquisitionTotals {
  @Field(() => Int)
  totalNew!: number;

  @Field(() => Int)
  totalFirstLoan!: number;

  @Field()
  avgConversionRate!: string;
}

@ObjectType()
class CustomerAcquisitionReportType {
  @Field(() => [CustomerAcquisitionEntry])
  entries!: CustomerAcquisitionEntry[];

  @Field(() => CustomerAcquisitionTotals)
  totals!: CustomerAcquisitionTotals;
}

// ─── Product Performance Report Types ───

@ObjectType()
class ProductPerformanceEntry {
  @Field()
  product!: string;

  @Field(() => Int)
  activeContracts!: number;

  @Field()
  totalDisbursed!: string;

  @Field()
  totalOutstanding!: string;

  @Field(() => Float)
  repaymentRate!: number;

  @Field(() => Float)
  parRate!: number;

  @Field()
  avgTicket!: string;

  @Field()
  avgTenor!: string;

  @Field()
  revenue!: string;
}

@ObjectType()
class ProductPerformanceReportType {
  @Field(() => [ProductPerformanceEntry])
  products!: ProductPerformanceEntry[];
}

// ─── Resolver ───

@Resolver()
export class ReportResolver {
  constructor(private prisma: PrismaService) {}

  // ─── Disbursement Report ───

  @Query(() => DisbursementReportType)
  @Roles('analytics:read')
  async disbursementReport(
    @CurrentTenant() tenantId: string,
    @Args('startDate', { nullable: true }) startDate?: string,
    @Args('endDate', { nullable: true }) endDate?: string,
  ): Promise<DisbursementReportType> {
    const where: any = {
      tenantId,
      status: 'completed',
    };
    if (startDate || endDate) {
      where.completedAt = {};
      if (startDate) where.completedAt.gte = new Date(startDate);
      if (endDate) where.completedAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const disbursements = await this.prisma.disbursement.findMany({
      where,
      include: { contract: { include: { product: { select: { name: true } } } } },
      orderBy: { completedAt: 'asc' },
    });

    // Group by date + product name. Money stays as Decimal strings end-to-end —
    // float accumulation drifts after a few thousand transactions.
    const grouped = new Map<string, { count: number; amount: string }>();
    for (const d of disbursements) {
      const dateStr = d.completedAt
        ? d.completedAt.toISOString().split('T')[0]
        : d.createdAt.toISOString().split('T')[0];
      const productName = d.contract?.product?.name ?? 'Unknown';
      const key = `${dateStr}|${productName}`;
      const existing = grouped.get(key) || { count: 0, amount: '0' };
      existing.count += 1;
      existing.amount = add(existing.amount, String(d.amount ?? '0'));
      grouped.set(key, existing);
    }

    const entries: DisbursementReportEntry[] = Array.from(grouped.entries()).map(([key, val]) => {
      const [date, product] = key.split('|');
      const avgTicket = val.count > 0 ? bankersRound(divide(val.amount, String(val.count)), 2) : '0.00';
      return {
        date,
        product,
        count: val.count,
        amount: bankersRound(val.amount, 2),
        avgTicket,
      };
    });

    const totalCount = entries.reduce((s, e) => s + e.count, 0);
    const totalAmount = entries.reduce((s, e) => add(s, e.amount), '0');
    const avgTicket = totalCount > 0 ? bankersRound(divide(totalAmount, String(totalCount)), 2) : '0.00';

    return {
      entries,
      totals: {
        totalCount,
        totalAmount: bankersRound(totalAmount, 2),
        avgTicket,
      },
    };
  }

  // ─── Repayment Report ───

  @Query(() => RepaymentReportType)
  @Roles('analytics:read')
  async repaymentReport(
    @CurrentTenant() tenantId: string,
    @Args('startDate', { nullable: true }) startDate?: string,
    @Args('endDate', { nullable: true }) endDate?: string,
  ): Promise<RepaymentReportType> {
    const where: any = {
      tenantId,
      status: 'completed',
    };
    if (startDate || endDate) {
      where.completedAt = {};
      if (startDate) where.completedAt.gte = new Date(startDate);
      if (endDate) where.completedAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const repayments = await this.prisma.repayment.findMany({
      where,
      orderBy: { completedAt: 'asc' },
    });

    // Group by date. Decimal aggregation — float accumulation drifts.
    const grouped = new Map<
      string,
      { total: string; principal: string; interest: string; fees: string; count: number }
    >();
    for (const r of repayments) {
      const dateStr = r.completedAt
        ? r.completedAt.toISOString().split('T')[0]
        : r.createdAt.toISOString().split('T')[0];
      const existing = grouped.get(dateStr) || {
        total: '0',
        principal: '0',
        interest: '0',
        fees: '0',
        count: 0,
      };
      existing.total = add(existing.total, String(r.amount ?? '0'));
      existing.principal = add(existing.principal, String(r.allocatedPrincipal ?? '0'));
      existing.interest = add(existing.interest, String(r.allocatedInterest ?? '0'));
      existing.fees = add(existing.fees, add(String(r.allocatedFees ?? '0'), String(r.allocatedPenalties ?? '0')));
      existing.count += 1;
      grouped.set(dateStr, existing);
    }

    const entries: RepaymentReportEntry[] = Array.from(grouped.entries()).map(([date, val]) => ({
      date,
      totalCollected: bankersRound(val.total, 2),
      principal: bankersRound(val.principal, 2),
      interest: bankersRound(val.interest, 2),
      fees: bankersRound(val.fees, 2),
      count: val.count,
    }));

    const totalCollected = entries.reduce((s, e) => add(s, e.totalCollected), '0');
    const totalPrincipal = entries.reduce((s, e) => add(s, e.principal), '0');
    const totalInterest = entries.reduce((s, e) => add(s, e.interest), '0');
    const totalFees = entries.reduce((s, e) => add(s, e.fees), '0');
    const totalCount = entries.reduce((s, e) => s + e.count, 0);

    return {
      entries,
      totals: {
        totalCollected: bankersRound(totalCollected, 2),
        principal: bankersRound(totalPrincipal, 2),
        interest: bankersRound(totalInterest, 2),
        fees: bankersRound(totalFees, 2),
        totalCount,
      },
    };
  }

  // ─── Customer Acquisition Report ───

  @Query(() => CustomerAcquisitionReportType)
  @Roles('analytics:read')
  async customerAcquisitionReport(
    @CurrentTenant() tenantId: string,
    @Args('startDate', { nullable: true }) startDate?: string,
    @Args('endDate', { nullable: true }) endDate?: string,
  ): Promise<CustomerAcquisitionReportType> {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');

    const hasDateFilter = startDate || endDate;
    const customerWhere: any = { tenantId };
    if (hasDateFilter) customerWhere.createdAt = dateFilter;

    // Fetch customers in range
    const customers = await this.prisma.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        createdAt: true,
        kycLevel: true,
      },
    });

    // Identify customers who took their first loan in this range
    // A "first loan" customer is one whose earliest contract was created in this period
    const customerIds = customers.map((c) => c.id);
    const firstLoanCustomerIds = new Set<string>();
    if (customerIds.length > 0) {
      const contractsForNewCustomers = await this.prisma.contract.findMany({
        where: {
          tenantId,
          customerId: { in: customerIds },
        },
        select: { customerId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      // For each customer, find if their first contract is in this period
      const earliestContract = new Map<string, Date>();
      for (const c of contractsForNewCustomers) {
        if (!earliestContract.has(c.customerId)) {
          earliestContract.set(c.customerId, c.createdAt);
        }
      }

      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date();
      for (const [custId, firstContractDate] of earliestContract) {
        if (firstContractDate >= start && firstContractDate <= end) {
          firstLoanCustomerIds.add(custId);
        }
      }
    }

    // Group by week
    const weekGroups = new Map<
      string,
      { newCustomers: number; kycCompleted: number; firstLoan: number; weekStart: Date }
    >();

    for (const c of customers) {
      const weekStart = getWeekStart(c.createdAt);
      const weekKey = weekStart.toISOString().split('T')[0];
      const existing = weekGroups.get(weekKey) || {
        newCustomers: 0,
        kycCompleted: 0,
        firstLoan: 0,
        weekStart,
      };
      existing.newCustomers += 1;
      if (c.kycLevel !== 'none') existing.kycCompleted += 1;
      if (firstLoanCustomerIds.has(c.id)) existing.firstLoan += 1;
      weekGroups.set(weekKey, existing);
    }

    const sortedWeeks = Array.from(weekGroups.entries()).sort(([a], [b]) => a.localeCompare(b));

    const entries: CustomerAcquisitionEntry[] = sortedWeeks.map(([_weekKey, val], idx) => {
      const weekEnd = new Date(val.weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const period = `Week ${idx + 1} (${formatShortDate(val.weekStart)}-${formatShortDate(weekEnd)})`;
      const conversionRate =
        val.newCustomers > 0
          ? ((val.firstLoan / val.newCustomers) * 100).toFixed(1) + '%'
          : '0.0%';
      return {
        period,
        newCustomers: val.newCustomers,
        kycCompleted: val.kycCompleted,
        firstLoan: val.firstLoan,
        conversionRate,
      };
    });

    const totalNew = entries.reduce((s, e) => s + e.newCustomers, 0);
    const totalFirstLoan = entries.reduce((s, e) => s + e.firstLoan, 0);
    const avgConversionRate =
      totalNew > 0 ? ((totalFirstLoan / totalNew) * 100).toFixed(1) + '%' : '0.0%';

    return {
      entries,
      totals: { totalNew, totalFirstLoan, avgConversionRate },
    };
  }

  // ─── Product Performance Report ───

  @Query(() => ProductPerformanceReportType)
  @Roles('analytics:read')
  async productPerformanceReport(
    @CurrentTenant() tenantId: string,
    @Args('startDate', { nullable: true }) startDate?: string,
    @Args('endDate', { nullable: true }) endDate?: string,
  ): Promise<ProductPerformanceReportType> {
    const contractDateFilter: any = {};
    if (startDate) contractDateFilter.gte = new Date(startDate);
    if (endDate) contractDateFilter.lte = new Date(endDate + 'T23:59:59.999Z');

    const hasDateFilter = startDate || endDate;

    // Get all products for this tenant
    const productsRaw = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    });

    const products: ProductPerformanceEntry[] = [];

    for (const product of productsRaw) {
      const contractWhere: any = { tenantId, productId: product.id };
      if (hasDateFilter) contractWhere.createdAt = contractDateFilter;

      const contracts = await this.prisma.contract.findMany({
        where: contractWhere,
        select: {
          id: true,
          principalAmount: true,
          totalOutstanding: true,
          totalPaid: true,
          daysPastDue: true,
          status: true,
          tenorDays: true,
        },
      });

      if (contracts.length === 0) continue;

      const activeContracts = contracts.filter((c) =>
        ['active', 'performing', 'due', 'overdue', 'delinquent'].includes(c.status),
      ).length;

      // Decimal aggregation — float accumulation drifts on large books.
      const totalDisbursed = contracts.reduce(
        (s, c) => add(s, String(c.principalAmount ?? '0')),
        '0',
      );
      const totalOutstanding = contracts.reduce(
        (s, c) => add(s, String(c.totalOutstanding ?? '0')),
        '0',
      );
      const totalPaid = contracts.reduce(
        (s, c) => add(s, String(c.totalPaid ?? '0')),
        '0',
      );
      const totalExpected = totalDisbursed;
      // Repayment rate is a fuzzy ratio (0–1); float math is fine here, but we
      // pass through Decimal divide so it stays exact for very large books.
      const repaymentRate = compare(totalExpected, '0') > 0
        ? Number(bankersRound(divide(totalPaid, totalExpected), 2))
        : 0;

      const parContracts = contracts.filter((c) => c.daysPastDue > 0).length;
      const parRate = contracts.length > 0 ? parContracts / contracts.length : 0;

      const avgTicket = contracts.length > 0
        ? bankersRound(divide(totalDisbursed, String(contracts.length)), 2)
        : '0.00';

      const tenorValues = contracts
        .map((c) => c.tenorDays)
        .filter((t): t is number => t !== null && t !== undefined);
      const avgTenorDays =
        tenorValues.length > 0
          ? Math.round(tenorValues.reduce((s, t) => s + t, 0) / tenorValues.length)
          : 0;

      // Revenue = totalPaid - totalDisbursed (simplified: interest + fees earned).
      // Clamp at zero with Decimal compare so we don't emit negative revenue.
      const revenueRaw = subtract(totalPaid, totalDisbursed);
      const revenue = compare(revenueRaw, '0') > 0 ? bankersRound(revenueRaw, 2) : '0.00';

      products.push({
        product: product.name,
        activeContracts,
        totalDisbursed: bankersRound(totalDisbursed, 2),
        totalOutstanding: bankersRound(totalOutstanding, 2),
        repaymentRate: Math.round(repaymentRate * 100) / 100,
        parRate: Math.round(parRate * 1000) / 1000,
        avgTicket,
        avgTenor: `${avgTenorDays} days`,
        revenue,
      });
    }

    return { products };
  }
}

// ─── Helpers ───

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatShortDate(date: Date): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}
