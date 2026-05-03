'use client';

import { gql, useQuery } from '@apollo/client';
import { TrendingDown, AlertOctagon } from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';

const PORTFOLIO_METRICS = gql`
  query PortfolioMetricsReport {
    portfolioMetrics {
      activeLoans activeOutstanding
      parAt1 { count amount pct }
      parAt7 { count amount pct }
      parAt30 { count amount pct }
      parAt60 { count amount pct }
      parAt90 { count amount pct }
      nplRatio
      provisioning { performing specialMention substandard doubtful loss total }
    }
  }
`;

export default function ReportsPage() {
  const { data, loading } = useQuery(PORTFOLIO_METRICS);
  const { t } = useI18n();
  const m = data?.portfolioMetrics;

  if (loading) {
    return (
      <div className="text-sm text-[color:var(--text-tertiary)] py-12 text-center">
        {t('common.loading')}
      </div>
    );
  }

  const provBuckets = [
    { label: t('reports.performing'), val: m?.provisioning?.performing, tone: 'success' },
    { label: t('reports.specialMention'), val: m?.provisioning?.specialMention, tone: 'warning' },
    { label: t('reports.substandard'), val: m?.provisioning?.substandard, tone: 'warning' },
    { label: t('reports.doubtful'), val: m?.provisioning?.doubtful, tone: 'error' },
    { label: t('reports.loss'), val: m?.provisioning?.loss, tone: 'error' },
  ] as const;

  const provTotal = Number(m?.provisioning?.total || 0);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.portfolioRisk')}
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
      />

      {/* PAR buckets */}
      <section className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
          <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('reports.portfolioAtRisk')}
          </h2>
        </div>
        <div className="stagger-children grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            [t('reports.par1'), m?.parAt1],
            [t('reports.par7'), m?.parAt7],
            [t('reports.par30'), m?.parAt30],
            [t('reports.par60'), m?.parAt60],
            [t('reports.par90'), m?.parAt90],
          ].map(([label, par]: any) => {
            const pct = (Number(par?.pct) || 0) * 100;
            const tone = pct > 10 ? 'error' : pct > 5 ? 'warning' : 'success';
            return (
              <div key={label} className="card-glow p-5 text-center">
                <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2">
                  {label}
                </p>
                <p
                  className="text-[28px] font-semibold tabular-nums leading-none"
                  style={{
                    color:
                      tone === 'error'
                        ? 'var(--status-error-text)'
                        : tone === 'warning'
                          ? 'var(--status-warning-text)'
                          : 'var(--accent-primary-deep)',
                    textShadow:
                      tone === 'success'
                        ? '0 0 16px rgba(var(--accent-primary-rgb), 0.30)'
                        : undefined,
                  }}
                >
                  {pct.toFixed(1)}%
                </p>
                <p className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums mt-2">
                  {par?.count ?? 0} {t('reports.contracts')}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Provisioning */}
      <section className="relative z-10 card-glow p-7">
        <div className="flex items-center gap-2 mb-5">
          <AlertOctagon className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
          <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('reports.provisioning')}
          </h2>
        </div>
        <div className="space-y-4">
          {provBuckets.map(({ label, val, tone }) => {
            const num = Number(val || 0);
            const pct = provTotal > 0 ? (num / provTotal) * 100 : 0;
            return (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-[13px] text-[color:var(--text-primary)]">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-[color:var(--text-primary)] tabular-nums font-semibold">
                      GHS {num.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums w-12 text-right">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <ProgressBar
                  value={pct}
                  max={100}
                  size="sm"
                  variant={
                    tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'error'
                  }
                />
              </div>
            );
          })}
          <div
            className="flex justify-between items-baseline pt-4 mt-2"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
              {t('reports.totalProvision')}
            </span>
            <span
              className="text-[24px] font-semibold tabular-nums"
              style={{
                color: 'var(--accent-primary-deep)',
                textShadow: '0 0 16px rgba(var(--accent-primary-rgb), 0.30)',
              }}
            >
              GHS {provTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
