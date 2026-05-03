'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Package,
  Users,
  FileText,
  Pencil,
  X,
  Activity,
  DollarSign,
  AlertTriangle,
  BarChart3,
  Clock,
  Shield,
  UserX,
  Building2,
  Check,
} from 'lucide-react';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { MetricCard } from '@/components/ui/metric-card';
import { Gauge } from '@/components/ui/gauge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { SlideOver } from '@/components/ui/slide-over';
import { formatDate, formatMoney } from '@/lib/utils';

const COUNTRY_CURRENCY: Record<string, string> = {
  GH: 'GHS', GHA: 'GHS',
  KE: 'KES', KEN: 'KES',
  NG: 'NGN', NGA: 'NGN',
  TZ: 'TZS', TZA: 'TZS',
  UG: 'UGX', UGA: 'UGX',
  ZA: 'ZAR', ZAF: 'ZAR',
  RW: 'RWF', RWA: 'RWF',
};

function currencyForCountry(country: string | undefined | null): string {
  return (country && COUNTRY_CURRENCY[country]) || 'USD';
}

interface ProductPerformanceRow {
  productId: string;
  productName: string;
  contracts: number;
  disbursed: string;
  defaultRate: string;
  avgScore: string;
}

const RechartsComponents = dynamic(
  () =>
    import('recharts').then((mod) => ({
      default: ({
        portfolioHealth,
        monthlyDisbursements,
      }: {
        portfolioHealth: { classification: string; count: number; amount: string }[];
        monthlyDisbursements: { month: string; totalAmount: string; count: number }[];
      }) => {
        const {
          ResponsiveContainer,
          PieChart,
          Pie,
          Cell,
          Tooltip,
          BarChart,
          Bar,
          XAxis,
          YAxis,
          CartesianGrid,
        } = mod;

        const classificationColors: Record<string, string> = {
          performing: 'var(--accent-primary)',
          special_mention: 'var(--status-warning)',
          substandard: '#f97316',
          doubtful: 'var(--status-error)',
          loss: '#7f1d1d',
        };
        const classificationLabels: Record<string, string> = {
          performing: 'Performing',
          special_mention: 'Watch',
          substandard: 'Substandard',
          doubtful: 'Doubtful',
          loss: 'Loss',
        };

        const pieData = portfolioHealth.filter((b) => b.count > 0);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card-glow p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  Portfolio health
                </h3>
                <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
                  Loan classification
                </span>
              </div>
              {pieData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="count"
                        nameKey="classification"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={88}
                        paddingAngle={3}
                        stroke="var(--bg-card)"
                        strokeWidth={2}
                      >
                        {pieData.map((entry) => (
                          <Cell
                            key={entry.classification}
                            fill={classificationColors[entry.classification] ?? 'var(--text-tertiary)'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'var(--text-primary)' }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={
                          ((value: any, name: any) => [
                            value,
                            classificationLabels[name] ?? name,
                          ]) as any
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2.5 text-[12px] shrink-0">
                    {portfolioHealth.map((b) => (
                      <div key={b.classification} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{
                            backgroundColor:
                              classificationColors[b.classification] ?? 'var(--text-tertiary)',
                            boxShadow: `0 0 6px ${classificationColors[b.classification] ?? 'var(--text-tertiary)'}`,
                          }}
                        />
                        <span className="text-[color:var(--text-secondary)]">
                          {classificationLabels[b.classification] ?? b.classification}
                        </span>
                        <span className="text-[color:var(--text-primary)] font-semibold ml-auto tabular-nums">
                          {b.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[color:var(--text-tertiary)] text-sm py-12 text-center">
                  No portfolio data yet.
                </p>
              )}
            </div>

            <div className="card-glow p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  Monthly disbursements
                </h3>
                <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
                  Last 12 months
                </span>
              </div>
              {monthlyDisbursements.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyDisbursements}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--border-subtle)' }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--border-subtle)' }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                      cursor={{ fill: 'var(--bg-hover)' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={
                        ((value: any) => [
                          parseFloat(String(value)).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          }),
                          'Amount',
                        ]) as any
                      }
                    />
                    <Bar dataKey="totalAmount" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[color:var(--text-tertiary)] text-sm py-12 text-center">
                  No disbursement data yet.
                </p>
              )}
            </div>
          </div>
        );
      },
    })),
  {
    ssr: false,
    loading: () => (
      <div className="text-[color:var(--text-tertiary)] text-sm py-8 text-center">
        Loading charts…
      </div>
    ),
  },
);

const TENANT_QUERY = gql`
  query Tenant($id: ID!) {
    tenant(id: $id) {
      id
      name
      slug
      country
      status
      planTier
      platformFeePercent
      settings
      createdAt
      updatedAt
    }
  }
`;

const TENANT_INSIGHTS_QUERY = gql`
  query TenantInsights($tenantId: ID!, $startDate: String, $endDate: String) {
    tenantInsights(tenantId: $tenantId, startDate: $startDate, endDate: $endDate) {
      activeContracts
      coolingOffContracts
      totalOutstanding
      defaultRate
      avgCreditScore
      portfolioHealth { classification count amount }
      monthlyDisbursements { month totalAmount count }
      revenueBreakdown { totalRevenue platformShare lenderShare netSPRevenue }
      productPerformance { productId productName contracts disbursed defaultRate avgScore }
      anonymizationCount
      anonymizationBlockedCount
      avgCustomerExposure
      customersNearExposureLimit
    }
  }
`;

const SET_PLATFORM_FEE = gql`
  mutation SetPlatformFee($id: ID!, $feePercent: String!) {
    setPlatformFee(id: $id, feePercent: $feePercent) {
      id
      platformFeePercent
    }
  }
`;

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const { data, loading } = useQuery(TENANT_QUERY, { variables: { id: tenantId } });
  const [setPlatformFee, { loading: updating }] = useMutation(SET_PLATFORM_FEE);

  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  });

  const { data: insightsData, loading: insightsLoading } = useQuery(TENANT_INSIGHTS_QUERY, {
    variables: {
      tenantId,
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined,
    },
    skip: !tenantId,
  });

  const [editing, setEditing] = useState(false);
  const [feeValue, setFeeValue] = useState('');
  const [editError, setEditError] = useState('');

  const tenant = data?.tenant;

  if (loading) {
    return (
      <div className="text-center py-16 text-[color:var(--text-secondary)]">Loading tenant…</div>
    );
  }
  if (!tenant) {
    return (
      <div className="text-center py-16 text-[color:var(--text-secondary)]">Tenant not found</div>
    );
  }

  const insights = insightsData?.tenantInsights;
  const currency = currencyForCountry(tenant.country);

  const openEdit = () => {
    setFeeValue(tenant.platformFeePercent ?? '');
    setEditError('');
    setEditing(true);
  };

  const handleSave = async () => {
    setEditError('');
    const trimmed = feeValue.trim();
    if (trimmed !== '') {
      const num = Number(trimmed);
      if (isNaN(num) || num < 0 || num > 100) {
        setEditError('Enter a valid percentage between 0 and 100');
        return;
      }
    }
    try {
      await setPlatformFee({
        variables: {
          id: tenantId,
          feePercent: trimmed === '' ? '0' : trimmed,
        },
      });
      setEditing(false);
    } catch (err: any) {
      setEditError(err?.graphQLErrors?.[0]?.message || err?.message || 'Failed to update');
    }
  };

  const drilldownLinks = [
    {
      name: 'Products',
      href: `/tenants/${tenantId}/products`,
      icon: Package,
      description: 'Loan products configured for this tenant',
    },
    {
      name: 'Customers',
      href: `/tenants/${tenantId}/customers`,
      icon: Users,
      description: 'Customers registered under this tenant',
    },
    {
      name: 'Contracts',
      href: `/tenants/${tenantId}/contracts`,
      icon: FileText,
      description: 'Active and historical loan contracts',
    },
  ];

  const tenantSettings =
    tenant.settings && typeof tenant.settings === 'object'
      ? (tenant.settings as Record<string, any>)
      : {};
  const exposureRules = tenantSettings.exposureRules || {};
  const maxExposure = exposureRules.maxCustomerExposure || '0';
  const crossProductEnabled = exposureRules.enableCrossProductCheck !== false;
  const hasLimit = parseFloat(maxExposure) > 0;

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <Link
        href="/tenants"
        className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All tenants
      </Link>

      {/* Hero card */}
      <section className="relative z-10 card-glow-hero card-glow-sweep p-7 lg:p-9">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-5">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-[20px] font-semibold flex-shrink-0"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
                border: '1px solid var(--border-default)',
              }}
            >
              {tenant.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="live-dot" aria-hidden />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
                  Tenant · {tenant.country}
                </span>
              </div>
              <h1
                className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
                style={{ fontSize: 36, lineHeight: 1.05 }}
              >
                {tenant.name}
              </h1>
              <p className="text-[12px] font-mono text-[color:var(--text-tertiary)] mt-1">
                {tenant.slug}
              </p>
            </div>
          </div>
          <StatusBadge status={tenant.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mt-7 pt-6 border-t border-[color:var(--border-subtle)]">
          <Field label="Country" value={tenant.country} />
          <Field
            label="Plan tier"
            value={
              <span className="capitalize">
                {tenant.planTier?.replace(/_/g, ' ') || '—'}
              </span>
            }
          />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
              Platform fee
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tabular-nums text-[color:var(--text-primary)]">
                {tenant.platformFeePercent != null
                  ? `${tenant.platformFeePercent}%`
                  : 'Not set'}
              </span>
              <button
                onClick={openEdit}
                className="text-[color:var(--text-tertiary)] hover:text-[color:var(--accent-primary-deep)] transition-colors p-1 rounded hover:bg-[color:var(--bg-hover)]"
                title="Edit platform fee"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          </div>
          <Field label="Created" value={formatDate(tenant.createdAt)} />
          <Field label="Updated" value={formatDate(tenant.updatedAt)} />
        </div>
      </section>

      {/* Drilldown links */}
      <section className="relative z-10 stagger-children grid grid-cols-1 md:grid-cols-3 gap-3">
        {drilldownLinks.map((link) => (
          <Link key={link.name} href={link.href} className="block h-full">
            <div className="card-glow p-5 cursor-pointer group h-full transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-3">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent-primary-soft)',
                    color: 'var(--accent-primary-deep)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <link.icon className="w-4 h-4" />
                </span>
                <ArrowLeft className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] rotate-[135deg] group-hover:text-[color:var(--accent-primary-deep)] transition-colors" />
              </div>
              <h3 className="text-[15px] font-semibold text-[color:var(--text-primary)] mb-1">
                {link.name}
              </h3>
              <p className="text-[12px] text-[color:var(--text-tertiary)]">{link.description}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* Insights section */}
      <section className="relative z-10 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--accent-primary-deep)]">
                Insights
              </span>
            </div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
              Operational telemetry
            </h2>
          </div>
          {/* Period selector */}
          <div className="inline-flex p-1 rounded-lg gap-1 card-glow" style={{ padding: 4 }}>
            {PERIODS.map((p) => {
              const start = new Date();
              start.setDate(start.getDate() - p.days);
              const ps = start.toISOString().split('T')[0];
              const isActive = dateRange.startDate === ps;
              return (
                <PeriodButton
                  key={p.label}
                  active={isActive}
                  onClick={() => {
                    const e = new Date();
                    const s = new Date();
                    s.setDate(s.getDate() - p.days);
                    setDateRange({
                      startDate: s.toISOString().split('T')[0],
                      endDate: e.toISOString().split('T')[0],
                    });
                  }}
                >
                  {p.label}
                </PeriodButton>
              );
            })}
            <PeriodButton
              active={dateRange.startDate === ''}
              onClick={() => setDateRange({ startDate: '', endDate: '' })}
            >
              All
            </PeriodButton>
          </div>
        </div>

        {insightsLoading ? (
          <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">
            Loading insights…
          </div>
        ) : insights ? (
          <>
            {/* KPI grid */}
            <div className="stagger-children grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                variant="glow"
                title="Active contracts"
                value={insights.activeContracts}
                icon={<FileText className="w-4 h-4" />}
              />
              <MetricCard
                variant="glow"
                title="Cooling-off"
                value={insights.coolingOffContracts ?? 0}
                icon={<Clock className="w-4 h-4" />}
              />
              <MetricCard
                variant="glow"
                title="Outstanding"
                value={formatMoney(insights.totalOutstanding, currency)}
                icon={<DollarSign className="w-4 h-4" />}
              />
              <MetricCard
                variant="glow"
                title="Default rate"
                value={`${insights.defaultRate}%`}
                icon={<AlertTriangle className="w-4 h-4" />}
                live={parseFloat(insights.defaultRate) > 5}
              />
              <MetricCard
                variant="glow"
                title="Avg credit score"
                value={parseFloat(insights.avgCreditScore).toFixed(0)}
                icon={<BarChart3 className="w-4 h-4" />}
              />
              <MetricCard
                variant="glow"
                title="Anonymizations"
                value={insights.anonymizationCount ?? 0}
                subtitle={`${insights.anonymizationBlockedCount ?? 0} blocked`}
                icon={<UserX className="w-4 h-4" />}
              />
            </div>

            {/* Charts */}
            <RechartsComponents
              portfolioHealth={insights.portfolioHealth}
              monthlyDisbursements={insights.monthlyDisbursements}
            />

            {/* Revenue breakdown */}
            {insights.revenueBreakdown && (
              <div className="card-glow p-6">
                <div className="flex items-baseline justify-between mb-5">
                  <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                    Revenue breakdown
                  </h3>
                  <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
                    Period
                  </span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <RevenueCell
                    label="Total revenue"
                    value={formatMoney(insights.revenueBreakdown.totalRevenue, currency)}
                  />
                  <RevenueCell
                    label="Platform share"
                    value={formatMoney(insights.revenueBreakdown.platformShare, currency)}
                    accent
                  />
                  <RevenueCell
                    label="Lender share"
                    value={formatMoney(insights.revenueBreakdown.lenderShare, currency)}
                    tone="warning"
                  />
                  <RevenueCell
                    label="Net SP revenue"
                    value={formatMoney(insights.revenueBreakdown.netSPRevenue, currency)}
                    tone="success"
                  />
                </div>
              </div>
            )}

            {/* Exposure configuration */}
            <div className="card-glow p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[color:var(--accent-primary-deep)]" />
                  <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                    Exposure configuration
                  </h3>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor:
                      hasLimit && crossProductEnabled
                        ? 'var(--status-success-soft)'
                        : 'var(--status-warning-soft)',
                    color:
                      hasLimit && crossProductEnabled
                        ? 'var(--status-success-text)'
                        : 'var(--status-warning-text)',
                    border: `1px solid ${
                      hasLimit && crossProductEnabled
                        ? 'var(--status-success)'
                        : 'var(--status-warning)'
                    }33`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        hasLimit && crossProductEnabled
                          ? 'var(--status-success)'
                          : 'var(--status-warning)',
                      boxShadow: `0 0 6px ${
                        hasLimit && crossProductEnabled
                          ? 'var(--status-success)'
                          : 'var(--status-warning)'
                      }`,
                    }}
                  />
                  {hasLimit && crossProductEnabled ? 'Active' : 'Not enforced'}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 grid grid-cols-2 gap-5">
                  <Field
                    label="Max customer exposure"
                    value={hasLimit ? formatMoney(maxExposure, currency) : 'No limit'}
                  />
                  <Field
                    label="Cross-product check"
                    value={crossProductEnabled ? 'Enabled' : 'Disabled'}
                  />
                  <Field
                    label="Avg customer exposure"
                    value={`${currency} ${insights.avgCustomerExposure ?? '0'}`}
                  />
                  <Field
                    label="Near limit (>80%)"
                    value={String(insights.customersNearExposureLimit ?? 0)}
                    tone={
                      (insights.customersNearExposureLimit ?? 0) > 0 ? 'warning' : 'default'
                    }
                  />
                </div>
                {hasLimit && (
                  <div className="flex flex-col items-center justify-center gap-2 px-4 py-2 rounded-lg" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
                    <Gauge
                      value={Math.min(
                        100,
                        (parseFloat(insights.avgCustomerExposure ?? '0') /
                          parseFloat(maxExposure)) *
                          100,
                      )}
                      size={140}
                    />
                    <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
                      Avg utilization
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Product performance */}
            {insights.productPerformance.length > 0 && (
              <div className="card-glow overflow-hidden">
                <div className="flex items-baseline justify-between px-6 py-5 border-b border-[color:var(--border-subtle)]">
                  <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                    Product performance
                  </h3>
                  <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                    {insights.productPerformance.length} product
                    {insights.productPerformance.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[color:var(--border-subtle)]">
                        <Th>Product</Th>
                        <Th>Contracts</Th>
                        <Th>Disbursed</Th>
                        <Th>Default rate</Th>
                        <Th>Avg score</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights.productPerformance.map((p: ProductPerformanceRow, i: number) => {
                        const drate = parseFloat(p.defaultRate);
                        return (
                          <tr
                            key={p.productId}
                            className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                            style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                          >
                            <Td>
                              <span className="text-[color:var(--text-primary)] font-medium">
                                {p.productName}
                              </span>
                            </Td>
                            <Td>
                              <span className="text-[color:var(--text-secondary)] tabular-nums">
                                {p.contracts}
                              </span>
                            </Td>
                            <Td>
                              <span className="text-[color:var(--text-secondary)] tabular-nums">
                                {formatMoney(p.disbursed, currency)}
                              </span>
                            </Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-[12px] font-semibold tabular-nums w-12"
                                  style={{
                                    color:
                                      drate > 5
                                        ? 'var(--status-error-text)'
                                        : drate > 2
                                          ? 'var(--status-warning-text)'
                                          : 'var(--text-primary)',
                                  }}
                                >
                                  {p.defaultRate}%
                                </span>
                                <ProgressBar
                                  value={Math.min(drate, 10)}
                                  max={10}
                                  size="sm"
                                  variant={drate > 5 ? 'error' : drate > 2 ? 'warning' : 'success'}
                                  className="w-24"
                                />
                              </div>
                            </Td>
                            <Td>
                              <span className="text-[color:var(--text-secondary)] tabular-nums">
                                {parseFloat(p.avgScore).toFixed(0)}
                              </span>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card-glow p-12 text-center">
            <Building2 className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
            <p className="text-sm text-[color:var(--text-secondary)]">
              No insights data available for this tenant yet.
            </p>
          </div>
        )}
      </section>

      {/* Edit fee slide-over */}
      <AnimatePresence>
        {editing && (
          <SlideOver
            title="Edit platform fee"
            subtitle={tenant.name}
            onClose={() => setEditing(false)}
            footer={
              <>
                <button
                  onClick={handleSave}
                  disabled={updating}
                  className="btn-primary disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {updating ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="btn-ghost">
                  Cancel
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-1.5">
                  Platform fee percent
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className="input-field pr-8"
                    value={feeValue}
                    onChange={(e) => setFeeValue(e.target.value)}
                    placeholder="e.g. 2.50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] text-sm">
                    %
                  </span>
                </div>
                {editError && (
                  <p className="text-xs text-[color:var(--status-error-text)] mt-2 flex items-center gap-1.5">
                    <X className="w-3 h-3" />
                    {editError}
                  </p>
                )}
                <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">
                  Percentage of revenue that flows to the Lōns platform on this tenant&apos;s contracts.
                </p>
              </div>
            </div>
          </SlideOver>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warning' | 'success';
}) {
  const color =
    tone === 'warning'
      ? 'var(--status-warning-text)'
      : tone === 'success'
        ? 'var(--status-success-text)'
        : 'var(--text-primary)';
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
        {label}
      </p>
      <p className="text-[15px] font-medium tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function RevenueCell({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: 'success' | 'warning';
}) {
  const color = accent
    ? 'var(--accent-primary-deep)'
    : tone === 'success'
      ? 'var(--status-success-text)'
      : tone === 'warning'
        ? 'var(--status-warning-text)'
        : 'var(--text-primary)';
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
        {label}
      </p>
      <p
        className="text-[18px] font-semibold tabular-nums"
        style={{
          color,
          textShadow: accent ? '0 0 16px rgba(var(--accent-primary-rgb), 0.30)' : undefined,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="relative px-3 py-1 rounded-md text-[12px] font-medium transition-colors"
      style={{
        color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
      }}
    >
      {active && (
        <motion.span
          layoutId="period-indicator"
          className="absolute inset-0 rounded-md"
          style={{
            backgroundColor: 'var(--accent-primary)',
            boxShadow: '0 4px 12px -4px rgba(var(--accent-primary-rgb), 0.45)',
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}
