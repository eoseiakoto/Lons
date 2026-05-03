'use client';

import { gql, useQuery } from '@apollo/client';
import {
  DollarSign,
  TrendingDown,
  AlertOctagon,
  Clock,
  AlertTriangle,
  ShieldAlert,
  ArrowUpRight,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import { MetricCard } from '@/components/ui/metric-card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Gauge } from '@/components/ui/gauge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { formatMoney } from '@/lib/utils';
import { NpsWidget } from '@/components/survey/nps-widget';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/i18n-context';

const PORTFOLIO_METRICS = gql`
  query PortfolioMetrics {
    portfolioMetrics {
      activeLoans
      activeOutstanding
      parAt30 { count amount pct }
      nplRatio
      provisioning { total }
    }
    collectionsMetrics {
      overdueCount
      delinquentCount
      defaultCount
      totalInCollections
    }
  }
`;

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, loading, error } = useQuery(PORTFOLIO_METRICS);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="shimmer h-10 w-64 rounded-md" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-7"><SkeletonCard /></div>
          <div className="col-span-12 md:col-span-5 grid grid-cols-1 gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="card-glow p-6 max-w-md"
        style={{ borderColor: 'var(--status-error)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--status-error-text)' }}>
          {t('dashboard.failedToLoad')}
        </p>
        <p className="text-sm text-[color:var(--text-secondary)] mt-1">{error.message}</p>
      </div>
    );
  }

  const metrics = data?.portfolioMetrics;
  const collections = data?.collectionsMetrics;
  const par30Pct = (Number(metrics?.parAt30?.pct) || 0) * 100;
  const nplPct = (Number(metrics?.nplRatio) || 0) * 100;
  const portfolioHealthPct = Math.max(0, 100 - par30Pct);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.portfolioTelemetry')}
        title={t('dashboard.overview')}
        subtitle={t('dashboard.overviewSubtitle')}
        actions={
          <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2 card-glow">
            <Activity className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
            <span className="text-[color:var(--text-secondary)]">{t('dashboard.health')}</span>
            <span className="text-[color:var(--accent-primary-deep)] font-medium tabular-nums">
              {portfolioHealthPct.toFixed(0)}%
            </span>
          </div>
        }
      />

      {/* Hero row — outstanding portfolio + risk gauges */}
      <section className="relative z-10 grid grid-cols-12 gap-4">
        <MetricCard
          variant="glow-hero"
          className="col-span-12 lg:col-span-7"
          title={t('dashboard.outstandingPortfolio')}
          value={
            <AnimatedNumber
              value={Number(metrics?.activeOutstanding ?? 0)}
              format={(n) => formatMoney(n.toFixed(2), 'GHS')}
              duration={1.8}
            />
          }
          subtitle={`${metrics?.activeLoans ?? 0} ${t('dashboard.activeLoansLower')}`}
          icon={<DollarSign className="w-4 h-4" />}
          live
          footer={
            <div className="grid grid-cols-3 gap-3 pt-4 mt-1 border-t border-[color:var(--border-subtle)]">
              <SubMetric label={t('common.active')} value={String(metrics?.activeLoans ?? 0)} accent />
              <SubMetric label={t('dashboard.atRisk')} value={String(metrics?.parAt30?.count ?? 0)} />
              <SubMetric label={t('dashboard.provisioning')} value={formatMoney(String(metrics?.provisioning?.total ?? 0), 'GHS')} />
            </div>
          }
        />

        <div className="col-span-12 lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricCard
            variant="glow"
            title={t('dashboard.par30Short')}
            value={<AnimatedNumber value={par30Pct} format={(n) => `${n.toFixed(1)}%`} />}
            subtitle={`${metrics?.parAt30?.count ?? 0} ${t('dashboard.contracts')}`}
            icon={<TrendingDown className="w-4 h-4" />}
            trend={par30Pct > 5 ? 'down' : 'up'}
            live={par30Pct > 5}
          />
          <MetricCard
            variant="glow"
            title={t('dashboard.nplRatioShort')}
            value={<AnimatedNumber value={nplPct} format={(n) => `${n.toFixed(1)}%`} />}
            subtitle={t('dashboard.nonPerforming')}
            icon={<AlertOctagon className="w-4 h-4" />}
            trend={nplPct > 3 ? 'down' : 'up'}
            live={nplPct > 3}
          />
          <div className="card-glow p-5 sm:col-span-2 flex items-center gap-5">
            <Gauge value={portfolioHealthPct} size={120} sublabel={t('dashboard.healthy')} />
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                  {t('dashboard.portfolioHealthScore')}
                </p>
                <p className="text-[13px] text-[color:var(--text-primary)] mt-0.5">
                  {portfolioHealthPct >= 95
                    ? t('dashboard.healthExcellent')
                    : portfolioHealthPct >= 85
                      ? t('dashboard.healthGood')
                      : portfolioHealthPct >= 70
                        ? t('dashboard.healthWatch')
                        : t('dashboard.healthAtRisk')}
                </p>
              </div>
              <ProgressBar
                value={portfolioHealthPct}
                max={100}
                size="sm"
                variant={
                  portfolioHealthPct >= 85
                    ? 'success'
                    : portfolioHealthPct >= 70
                      ? 'warning'
                      : 'error'
                }
                label={t('dashboard.healthFormulaLabel')}
                rightLabel={`${portfolioHealthPct.toFixed(0)}%`}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Collections section */}
      <section className="relative z-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[20px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('dashboard.collections')}
          </h2>
          <Link
            href="/collections"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] transition-colors"
          >
            {t('dashboard.viewQueue')}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="stagger-children grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              label: t('dashboard.overdueContracts'),
              value: collections?.overdueCount ?? 0,
              Icon: Clock,
              tone: 'warning',
            },
            {
              label: t('dashboard.delinquent'),
              value: collections?.delinquentCount ?? 0,
              Icon: AlertTriangle,
              tone: 'warning',
            },
            {
              label: t('dashboard.default'),
              value: collections?.defaultCount ?? 0,
              Icon: ShieldAlert,
              tone: 'error',
            },
          ].map(({ label, value, Icon, tone }) => {
            const color =
              tone === 'error' ? 'var(--status-error)' : 'var(--status-warning)';
            return (
              <div key={label} className="card-glow p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Icon
                      className="w-3.5 h-3.5"
                      style={{ color }}
                    />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
                      {label}
                    </span>
                  </span>
                  {Number(value) > 0 && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                    />
                  )}
                </div>
                <p className="text-[32px] font-semibold tabular-nums leading-none text-[color:var(--text-primary)]">
                  <AnimatedNumber value={Number(value)} />
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Total in collections — hero CTA */}
      <section className="relative z-10 card-glow-hero card-glow-sweep p-6 lg:p-7 flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="live-dot" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
              {t('dashboard.actionNeeded')}
            </span>
          </div>
          <p className="text-[13px] font-medium text-[color:var(--text-secondary)]">
            {t('dashboard.totalContractsInCollections')}
          </p>
          <p
            className="text-[44px] leading-none font-semibold tracking-[-0.03em] mt-2 tabular-nums"
            style={{
              color: 'var(--accent-primary-deep)',
              textShadow: '0 0 24px rgba(var(--accent-primary-rgb), 0.30)',
            }}
          >
            <AnimatedNumber value={Number(collections?.totalInCollections ?? 0)} />
          </p>
          <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 max-w-[44ch]">
            {t('dashboard.contractsRequiringAttention')}
          </p>
        </div>
        <Link href="/collections" className="btn-primary text-sm shrink-0">
          {t('dashboard.openCollections')}
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </section>

      {/* NPS Survey Widget */}
      {user && <NpsWidget tenantId={user.tenantId} userId={user.userId} />}
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
        className="text-[16px] font-semibold tabular-nums leading-tight truncate"
        style={{ color: accent ? 'var(--accent-primary-deep)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}
