'use client';

import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, BarChart3, Building2, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { ProgressBar } from '@/components/ui/progress-bar';

const PLATFORM_SCORING_ANALYTICS_QUERY = gql`
  query PlatformScoringAnalytics($days: Float) {
    platformScoringAnalytics(days: $days) {
      scoreDistribution { label min max count }
      riskTierBreakdown { riskTier count }
      scoringVolume { date modelType count }
      tenantComparison {
        tenantId
        tenantName
        totalScorings
        avgScore
        lowRiskCount
        highRiskCount
      }
    }
  }
`;

const RISK_COLORS: Record<string, string> = {
  low: 'var(--status-success)',
  medium: 'var(--status-warning)',
  high: '#f87171',
  critical: 'var(--status-error)',
};

const RISK_LABELS: Record<string, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
};

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
};

const DistributionChart = dynamic(
  () =>
    Promise.resolve({
      default: function DistChart({
        data,
      }: {
        data: { label: string; count: number }[];
      }) {
        return (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
              />
              <YAxis
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--bg-hover)' }} />
              <Bar dataKey="count" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      },
    }),
  { ssr: false },
);

const RiskTierDonut = dynamic(
  () =>
    Promise.resolve({
      default: function DonutChart({
        data,
      }: {
        data: { riskTier: string; count: number }[];
      }) {
        const chartData = data.map((d) => ({
          name: RISK_LABELS[d.riskTier] || d.riskTier,
          value: d.count,
          fill: RISK_COLORS[d.riskTier] || 'var(--text-tertiary)',
        }));
        return (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={94}
                paddingAngle={3}
                dataKey="value"
                stroke="var(--bg-card)"
                strokeWidth={2}
                label={
                  ((props: any) =>
                    `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`) as any
                }
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                wrapperStyle={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      },
    }),
  { ssr: false },
);

const VolumeChart = dynamic(
  () =>
    Promise.resolve({
      default: function VolChart({
        data,
      }: {
        data: { date: string; count: number; modelType: string }[];
      }) {
        const byDate = new Map<string, number>();
        for (const d of data) {
          byDate.set(d.date, (byDate.get(d.date) || 0) + d.count);
        }
        const chartData = Array.from(byDate.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));
        return (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
              />
              <YAxis
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--accent-primary-soft)' }} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--accent-primary)"
                strokeWidth={2}
                dot={{ fill: 'var(--accent-primary)', r: 3 }}
                activeDot={{
                  r: 5,
                  stroke: 'var(--bg-page)',
                  strokeWidth: 2,
                  fill: 'var(--accent-primary)',
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      },
    }),
  { ssr: false },
);

const PERIODS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

export default function ScoringAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, loading } = useQuery(PLATFORM_SCORING_ANALYTICS_QUERY, {
    variables: { days },
  });

  const analytics = data?.platformScoringAnalytics;

  const totalScorings =
    analytics?.scoreDistribution?.reduce((sum: number, b: any) => sum + b.count, 0) ?? 0;

  const avgScore = analytics?.tenantComparison?.length
    ? (
        analytics.tenantComparison.reduce(
          (sum: number, t: any) => sum + parseFloat(t.avgScore) * t.totalScorings,
          0,
        ) / Math.max(totalScorings, 1)
      ).toFixed(1)
    : '—';

  const highRiskPct =
    totalScorings > 0 && analytics?.riskTierBreakdown
      ? (
          (analytics.riskTierBreakdown
            .filter((r: any) => r.riskTier === 'high' || r.riskTier === 'critical')
            .reduce((s: number, r: any) => s + r.count, 0) /
            totalScorings) *
          100
        ).toFixed(1) + '%'
      : '—';

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow="Live · Scoring telemetry"
        title="Scoring analytics"
        subtitle="Score distribution, risk tiers, and how tenants compare."
        actions={
          <div className="inline-flex p-1 rounded-lg gap-1 card-glow" style={{ padding: 4 }}>
            {PERIODS.map((p) => {
              const isActive = days === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => setDays(p.value)}
                  className="relative px-3 py-1 rounded-md text-[12px] font-medium transition-colors"
                  style={{
                    color: isActive ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="scoring-period-indicator"
                      className="absolute inset-0 rounded-md"
                      style={{
                        backgroundColor: 'var(--accent-primary)',
                        boxShadow: '0 4px 12px -4px rgba(var(--accent-primary-rgb), 0.45)',
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{p.label}</span>
                </button>
              );
            })}
          </div>
        }
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title="Total scorings"
          value={loading ? '—' : totalScorings.toLocaleString()}
          subtitle={`Last ${days}d`}
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Avg score"
          value={loading ? '—' : avgScore}
          subtitle="Weighted across tenants"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="High risk"
          value={loading ? '—' : highRiskPct}
          subtitle="High + critical tier"
          icon={<TrendingUp className="w-4 h-4" />}
          live={parseFloat(String(highRiskPct).replace('%', '')) > 10}
        />
        <MetricCard
          variant="glow"
          title="Active tenants"
          value={loading ? '—' : analytics?.tenantComparison?.length ?? 0}
          subtitle="Generating scores"
          icon={<Building2 className="w-4 h-4" />}
        />
      </section>

      {/* Charts row */}
      <section className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-glow p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              Score distribution
            </h3>
            <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
              Buckets
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-[260px] text-[color:var(--text-tertiary)] text-sm">
              Loading…
            </div>
          ) : analytics?.scoreDistribution?.length ? (
            <DistributionChart data={analytics.scoreDistribution} />
          ) : (
            <div className="flex items-center justify-center h-[260px] text-[color:var(--text-tertiary)] text-sm">
              No data available
            </div>
          )}
        </div>

        <div className="card-glow p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              Risk tier breakdown
            </h3>
            <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
              Share
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-[260px] text-[color:var(--text-tertiary)] text-sm">
              Loading…
            </div>
          ) : analytics?.riskTierBreakdown?.length ? (
            <RiskTierDonut data={analytics.riskTierBreakdown} />
          ) : (
            <div className="flex items-center justify-center h-[260px] text-[color:var(--text-tertiary)] text-sm">
              No data available
            </div>
          )}
        </div>
      </section>

      {/* Volume chart */}
      <section className="relative z-10 card-glow p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            Scoring volume over time
          </h3>
          <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
            Daily aggregate
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-[260px] text-[color:var(--text-tertiary)] text-sm">
            Loading…
          </div>
        ) : analytics?.scoringVolume?.length ? (
          <VolumeChart data={analytics.scoringVolume} />
        ) : (
          <div className="flex items-center justify-center h-[260px] text-[color:var(--text-tertiary)] text-sm">
            No data available
          </div>
        )}
      </section>

      {/* Tenant comparison */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="flex items-baseline justify-between px-6 py-5 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            Tenant comparison
          </h3>
          <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
            {analytics?.tenantComparison?.length ?? 0} tenant
            {(analytics?.tenantComparison?.length ?? 0) === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>Tenant</Th>
                <Th>Scorings</Th>
                <Th>Avg score</Th>
                <Th>Low risk</Th>
                <Th>High risk</Th>
                <Th>Risk mix</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    Loading…
                  </td>
                </tr>
              ) : !analytics?.tenantComparison?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    No tenant data available
                  </td>
                </tr>
              ) : (
                analytics.tenantComparison.map((t: any, i: number) => {
                  const total = t.lowRiskCount + t.highRiskCount;
                  const highPct = total > 0 ? (t.highRiskCount / total) * 100 : 0;
                  return (
                    <tr
                      key={t.tenantId || i}
                      className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] flex-shrink-0" />
                          <span className="text-[color:var(--text-primary)] font-medium">
                            {t.tenantName || t.tenantId.slice(0, 8) + '…'}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-secondary)] tabular-nums">
                          {t.totalScorings.toLocaleString()}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-primary)] font-semibold tabular-nums">
                          {parseFloat(t.avgScore).toFixed(1)}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] tabular-nums"
                          style={{ color: 'var(--status-success-text)' }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: 'var(--status-success)',
                              boxShadow: '0 0 6px var(--status-success)',
                            }}
                          />
                          {t.lowRiskCount}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] tabular-nums"
                          style={{ color: 'var(--status-error-text)' }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: 'var(--status-error)',
                              boxShadow: '0 0 6px var(--status-error)',
                            }}
                          />
                          {t.highRiskCount}
                        </span>
                      </Td>
                      <Td>
                        <ProgressBar
                          value={highPct}
                          max={100}
                          size="sm"
                          variant={highPct > 30 ? 'error' : highPct > 15 ? 'warning' : 'success'}
                          className="w-32"
                          rightLabel={`${highPct.toFixed(0)}%`}
                        />
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
