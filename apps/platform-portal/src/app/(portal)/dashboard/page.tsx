'use client';

import { useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  Globe2,
  TrendingUp,
  Sparkles,
  Layers,
  ArrowUpRight,
  Activity,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { MetricCard } from '@/components/ui/metric-card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Sparkline } from '@/components/ui/sparkline';
import { AreaChart } from '@/components/ui/area-chart';
import { Gauge } from '@/components/ui/gauge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { formatDate } from '@/lib/utils';

const PLATFORM_DASHBOARD_QUERY = gql`
  query PlatformDashboard {
    tenants(pagination: { first: 100 }) {
      edges {
        node {
          id
          name
          slug
          country
          status
          planTier
          createdAt
        }
      }
      totalCount
    }
  }
`;

interface Tenant {
  id: string;
  name: string;
  slug: string;
  country: string;
  status: string;
  planTier: string;
  createdAt: string;
}

const PLAN_ORDER = ['enterprise', 'growth', 'starter', 'trial'] as const;
const PLAN_LABEL: Record<string, string> = {
  enterprise: 'Enterprise',
  professional: 'Growth',
  starter: 'Starter',
  trial: 'Trial',
};

export default function DashboardPage() {
  const { data, loading } = useQuery(PLATFORM_DASHBOARD_QUERY);
  const router = useRouter();

  const tenants: Tenant[] = data?.tenants?.edges?.map((e: any) => e.node) ?? [];
  const totalCount: number = data?.tenants?.totalCount ?? 0;

  const stats = useMemo(() => {
    const active = tenants.filter((t) => t.status === 'active').length;
    const provisioning = tenants.filter((t) => t.status === 'provisioning').length;
    const suspended = tenants.filter((t) => t.status === 'suspended').length;

    const planCounts: Record<string, number> = {};
    tenants.forEach((t) => {
      const k = t.planTier?.toLowerCase() || 'unknown';
      planCounts[k] = (planCounts[k] || 0) + 1;
    });

    const countryCounts: Record<string, number> = {};
    tenants.forEach((t) => {
      const k = t.country || 'UNK';
      countryCounts[k] = (countryCounts[k] || 0) + 1;
    });
    const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);

    // Tenant growth over time — group by month
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, 0);
    }
    let cumulative = 0;
    const cumulativeByMonth = new Map<string, number>();
    const sortedTenants = [...tenants].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    sortedTenants.forEach((t) => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      cumulative += 1;
      cumulativeByMonth.set(key, cumulative);
    });
    const finalCumulative = cumulative;
    let lastKnown = 0;
    const monthlyGrowth = Array.from(buckets.keys()).map((key) => {
      const d = new Date(`${key}-01T00:00:00Z`);
      const v = cumulativeByMonth.get(key);
      if (v != null) lastKnown = v;
      return {
        label: d.toLocaleString('en', { month: 'short' }),
        value: v ?? lastKnown,
      };
    });
    // If no tenants in earlier months, prefix with zero baseline
    if (finalCumulative > 0) {
      const zeroIdx = monthlyGrowth.findIndex((m) => m.value > 0);
      if (zeroIdx > 0) {
        for (let i = 0; i < zeroIdx; i++) monthlyGrowth[i].value = 0;
      }
    }

    const peakMonth = monthlyGrowth.reduce(
      (acc, m, i) => (m.value > acc.value ? { value: m.value, idx: i } : acc),
      { value: -Infinity, idx: 0 },
    );

    return {
      active,
      provisioning,
      suspended,
      planCounts,
      sortedCountries,
      monthlyGrowth,
      peakIdx: peakMonth.idx,
      activePct: totalCount > 0 ? Math.round((active / totalCount) * 100) : 0,
    };
  }, [tenants, totalCount]);

  const sparkData = stats.monthlyGrowth.map((m) => m.value);
  const recentTenants = [...tenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const topPlanEntry = Object.entries(stats.planCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      {/* Header strip with status pill */}
      <header className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="live-dot" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
              Live · Platform telemetry
            </span>
          </div>
          <h1
            className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
            style={{ fontSize: 44, lineHeight: 1.05 }}
          >
            Platform Overview
          </h1>
          <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
            Who's on Lōns and how the network is doing today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2 card-glow">
            <Activity className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
            <span className="text-[color:var(--text-secondary)]">All systems</span>
            <span className="text-[color:var(--accent-primary-deep)] font-medium">operational</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* Top KPI strip — 5 compact glow cards */}
          <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard
              variant="glow"
              title="Tenants"
              value={<AnimatedNumber value={totalCount} />}
              subtitle="On platform"
              icon={<Building2 className="w-4 h-4" />}
            />
            <MetricCard
              variant="glow"
              title="Active"
              value={<AnimatedNumber value={stats.active} />}
              subtitle={`${stats.activePct}% of total`}
              icon={<CheckCircle2 className="w-4 h-4" />}
              live
            />
            <MetricCard
              variant="glow"
              title="Onboarding"
              value={<AnimatedNumber value={stats.provisioning} />}
              subtitle="Provisioning"
              icon={<Sparkles className="w-4 h-4" />}
            />
            <MetricCard
              variant="glow"
              title="Plans"
              value={Object.keys(stats.planCounts).length}
              subtitle={topPlanEntry ? `Top · ${PLAN_LABEL[topPlanEntry[0]] ?? topPlanEntry[0]}` : '—'}
              icon={<Layers className="w-4 h-4" />}
            />
            <MetricCard
              variant="glow"
              title="Countries"
              value={stats.sortedCountries.length}
              subtitle={stats.sortedCountries.slice(0, 3).map(([c]) => c).join(' · ') || '—'}
              icon={<Globe2 className="w-4 h-4" />}
            />
          </section>

          {/* Hero row — service providers + growth chart */}
          <section className="relative z-10 grid grid-cols-12 gap-4">
            <MetricCard
              variant="glow-hero"
              className="col-span-12 lg:col-span-5"
              title="Service providers"
              value={<AnimatedNumber value={totalCount} />}
              subtitle={`${stats.active} active · ${stats.sortedCountries.length} countries reached`}
              icon={<Building2 className="w-4 h-4" />}
              live
              chart={
                <Sparkline
                  data={sparkData.length > 1 ? sparkData : [0, totalCount]}
                  width={320}
                  height={56}
                  color="var(--accent-primary)"
                  className="w-full h-14"
                />
              }
              footer={
                <div className="grid grid-cols-3 gap-3 pt-4 mt-1 border-t border-[color:var(--border-subtle)]">
                  <SubMetric label="Active" value={String(stats.active)} accent />
                  <SubMetric label="Onboarding" value={String(stats.provisioning)} />
                  <SubMetric label="Suspended" value={String(stats.suspended)} />
                </div>
              }
            />

            <div className="col-span-12 lg:col-span-7 card-glow card-glow-sweep p-6 lg:p-7 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">
                    Tenant growth
                  </p>
                  <p className="text-[22px] font-semibold tracking-tight text-[color:var(--text-primary)] mt-1">
                    Last 12 months
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                    Cumulative
                  </p>
                  <p className="text-[22px] font-semibold tabular-nums text-[color:var(--accent-primary-deep)] mt-1 flex items-center gap-1 justify-end">
                    <ArrowUpRight className="w-4 h-4" />
                    {totalCount}
                  </p>
                </div>
              </div>
              <div className="flex-1 -mx-2">
                <AreaChart
                  data={stats.monthlyGrowth}
                  height={220}
                  pinIndex={stats.peakIdx}
                  pinLabel={`peak · ${stats.monthlyGrowth[stats.peakIdx]?.label ?? ''}`}
                  color="var(--accent-primary)"
                />
              </div>
            </div>
          </section>

          {/* Plan distribution row — 4 cards with progress bars */}
          <section className="relative z-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[20px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                Plan distribution
              </h2>
              <span className="text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
                {totalCount} tenants
              </span>
            </div>
            <div className="stagger-children grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {PLAN_ORDER.map((plan) => {
                const count = stats.planCounts[plan] ?? 0;
                const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                return (
                  <div key={plan} className="card-glow p-5 flex flex-col gap-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-medium text-[color:var(--text-primary)]">
                        {PLAN_LABEL[plan]}
                      </span>
                      <span className="text-[11px] text-[color:var(--accent-primary-deep)] font-medium tabular-nums">
                        {pct}%
                      </span>
                    </div>
                    <div className="text-[28px] font-semibold tabular-nums leading-none text-[color:var(--text-primary)]">
                      <AnimatedNumber value={count} />
                    </div>
                    <ProgressBar value={count} max={totalCount || 1} size="sm" />
                    <div className="text-[11px] text-[color:var(--text-tertiary)]">
                      {count === 1 ? '1 tenant' : `${count} tenants`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Bottom row — recent tenants + top countries + active health gauge */}
          <section className="relative z-10 grid grid-cols-12 gap-4">
            {/* Recent tenants table */}
            <div className="col-span-12 lg:col-span-7 card-glow p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  Recent tenants
                </h2>
                <button
                  onClick={() => router.push('/tenants')}
                  className="text-[12px] text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] transition-colors flex items-center gap-1"
                >
                  View all <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {recentTenants.length === 0 ? (
                  <p className="text-sm text-[color:var(--text-tertiary)] py-6 text-center">
                    No tenants yet.
                  </p>
                ) : (
                  recentTenants.map((t, i) => (
                    <motion.button
                      key={t.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                      onClick={() => router.push(`/tenants/${t.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[color:var(--bg-hover)] transition-colors text-left group"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                        style={{
                          backgroundColor: 'var(--accent-primary-soft)',
                          color: 'var(--accent-primary-deep)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium text-[color:var(--text-primary)] truncate">
                          {t.name}
                        </div>
                        <div className="text-[11px] text-[color:var(--text-tertiary)]">
                          {t.country} · {PLAN_LABEL[t.planTier?.toLowerCase()] ?? t.planTier}
                        </div>
                      </div>
                      <StatusBadge status={t.status} />
                      <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums w-20 text-right">
                        {formatDate(t.createdAt)}
                      </span>
                    </motion.button>
                  ))
                )}
              </div>
            </div>

            {/* Top countries */}
            <div className="col-span-12 md:col-span-6 lg:col-span-3 card-glow p-6 flex flex-col">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  Top markets
                </h2>
                <Globe2 className="w-4 h-4 text-[color:var(--accent-primary-deep)]" />
              </div>
              <div className="flex-1 flex flex-col gap-3">
                {stats.sortedCountries.slice(0, 5).map(([country, count], i) => {
                  const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                  return (
                    <div key={country} className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13px] text-[color:var(--text-primary)] flex items-center gap-2">
                          <span className="text-[10px] text-[color:var(--text-tertiary)] tabular-nums w-4">
                            {i + 1}
                          </span>
                          {country}
                        </span>
                        <span className="text-[12px] text-[color:var(--accent-primary-deep)] tabular-nums font-semibold">
                          {count}
                        </span>
                      </div>
                      <ProgressBar value={pct} max={100} size="sm" />
                    </div>
                  );
                })}
                {stats.sortedCountries.length === 0 && (
                  <p className="text-sm text-[color:var(--text-tertiary)] py-6 text-center">
                    No data.
                  </p>
                )}
              </div>
            </div>

            {/* Active health gauge */}
            <div className="col-span-12 md:col-span-6 lg:col-span-2 card-glow p-6 flex flex-col items-center justify-between">
              <div className="w-full text-center">
                <h2 className="text-[14px] font-medium text-[color:var(--text-primary)]">
                  Active rate
                </h2>
                <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1">
                  Across all tenants
                </p>
              </div>
              <Gauge value={stats.activePct} size={160} />
              <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                <TrendingUp className="w-3 h-3 text-[color:var(--accent-primary-deep)]" />
                {stats.active} of {totalCount} live
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SubMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {label}
      </span>
      <span
        className="text-[18px] font-semibold tabular-nums leading-none"
        style={{ color: accent ? 'var(--accent-primary-deep)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}
