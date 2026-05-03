'use client';

import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { ArrowLeft } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Gauge } from '@/components/ui/gauge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatMoney } from '@/lib/utils';
import { compare } from '@/lib/decimal';
import {
  CONCENTRATION_SUMMARY_QUERY,
  type IConcentrationSummary,
  type IDebtorExposureRow,
  type IIndustryExposureRow,
  type ILimitUtilizationRow,
} from '@/lib/graphql/factoring';

const LIMIT_LABEL_KEY: Record<string, string> = {
  debtor_percent: 'factoring.concentration.limit.debtorPercent',
  debtor_absolute: 'factoring.concentration.limit.debtorAbsolute',
  industry_percent: 'factoring.concentration.limit.industryPercent',
  seller_debtor_percent: 'factoring.concentration.limit.sellerDebtorPercent',
};

export default function ConcentrationDashboardPage() {
  const { t } = useI18n();

  const { data, loading } = useQuery(CONCENTRATION_SUMMARY_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  const summary = data?.concentrationSummary as
    | IConcentrationSummary
    | undefined;

  const topDebtors: IDebtorExposureRow[] = summary?.topDebtors ?? [];
  const industries: IIndustryExposureRow[] = summary?.industryBreakdown ?? [];
  const limits: ILimitUtilizationRow[] = summary?.limitUtilization ?? [];

  const debtorColumns = [
    {
      header: t('factoring.concentration.column.debtor'),
      accessor: (row: IDebtorExposureRow) => (
        <Link
          href={`/debtors/${row.debtorId}`}
          className="text-[color:var(--text-primary)] hover:text-[color:var(--accent-primary)] transition-colors"
        >
          {row.companyName}
        </Link>
      ),
    },
    {
      header: t('factoring.concentration.column.exposure'),
      accessor: (row: IDebtorExposureRow) => (
        <span className="tabular-nums">
          {formatMoney(row.totalExposure, 'GHS')}
        </span>
      ),
    },
    {
      header: t('factoring.concentration.column.percentOfPortfolio'),
      accessor: (row: IDebtorExposureRow) => (
        <div className="flex items-center gap-2 min-w-[180px]">
          <ProgressBar
            value={Number(row.percentOfPortfolio)}
            max={100}
            size="sm"
            variant={
              compare(row.percentOfPortfolio, '20') >= 0
                ? 'error'
                : compare(row.percentOfPortfolio, '10') >= 0
                  ? 'warning'
                  : 'accent'
            }
            className="flex-1"
          />
          <span className="text-[12px] tabular-nums text-[color:var(--text-secondary)] w-12 text-right">
            {row.percentOfPortfolio}%
          </span>
        </div>
      ),
    },
  ];

  const industryColumns = [
    {
      header: t('factoring.concentration.column.industry'),
      accessor: (row: IIndustryExposureRow) =>
        row.industrySector ?? t('factoring.concentration.unspecifiedIndustry'),
    },
    {
      header: t('factoring.concentration.column.debtorCount'),
      accessor: (row: IIndustryExposureRow) => (
        <span className="tabular-nums">{row.debtorCount}</span>
      ),
    },
    {
      header: t('factoring.concentration.column.exposure'),
      accessor: (row: IIndustryExposureRow) => (
        <span className="tabular-nums">
          {formatMoney(row.totalExposure, 'GHS')}
        </span>
      ),
    },
    {
      header: t('factoring.concentration.column.percentOfPortfolio'),
      accessor: (row: IIndustryExposureRow) => (
        <div className="flex items-center gap-2 min-w-[180px]">
          <ProgressBar
            value={Number(row.percentOfPortfolio)}
            max={100}
            size="sm"
            variant={
              compare(row.percentOfPortfolio, '40') >= 0
                ? 'error'
                : compare(row.percentOfPortfolio, '25') >= 0
                  ? 'warning'
                  : 'accent'
            }
            className="flex-1"
          />
          <span className="text-[12px] tabular-nums text-[color:var(--text-secondary)] w-12 text-right">
            {row.percentOfPortfolio}%
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <Link
        href="/loans/factoring"
        className="relative z-10 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('factoring.pipelineTitle')}
      </Link>

      <PageHeader
        eyebrow={t('factoring.eyebrow')}
        title={t('factoring.concentration.title')}
        subtitle={t('factoring.concentration.subtitle')}
      />

      {loading && !summary ? (
        <div className="relative z-10 card-glow p-12 text-center text-[color:var(--text-tertiary)]">
          {t('common.loading')}
        </div>
      ) : (
        <>
          {/* Limit utilization gauges. */}
          <section className="relative z-10 space-y-3">
            <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
              {t('factoring.concentration.limitsTitle')}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {limits.length === 0 ? (
                <div className="col-span-full card-glow p-8 text-center text-[color:var(--text-tertiary)] text-sm">
                  {t('factoring.concentration.noLimits')}
                </div>
              ) : (
                limits.map((row) => {
                  const utilization = Number(row.utilizationPercent);
                  const isAbsolute = row.type === 'debtor_absolute';
                  return (
                    <div
                      key={row.type}
                      className="card-glow p-5 flex flex-col items-center gap-2"
                    >
                      <Gauge
                        value={utilization}
                        size={150}
                        label={t(
                          LIMIT_LABEL_KEY[row.type] ??
                            'factoring.concentration.limit.unknown',
                        )}
                        sublabel={
                          isAbsolute
                            ? `${formatMoney(row.current, 'GHS')} / ${formatMoney(row.max, 'GHS')}`
                            : `${row.current}% / ${row.max}%`
                        }
                      />
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider ${
                          utilization < 60
                            ? 'text-[color:var(--status-success-text)]'
                            : utilization < 80
                              ? 'text-[color:var(--status-warning-text)]'
                              : 'text-[color:var(--status-error-text)]'
                        }`}
                      >
                        {utilization < 60
                          ? t('factoring.concentration.healthy')
                          : utilization < 80
                            ? t('factoring.concentration.watch')
                            : t('factoring.concentration.breach')}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Top debtors. */}
          <section className="relative z-10 space-y-3">
            <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
              {t('factoring.concentration.topDebtorsTitle')}
            </h2>
            <div className="card-glow overflow-hidden">
              <DataTable
                columns={debtorColumns}
                data={topDebtors}
                emptyMessage={t('factoring.concentration.noDebtors')}
              />
            </div>
          </section>

          {/* Industry breakdown. */}
          <section className="relative z-10 space-y-3">
            <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
              {t('factoring.concentration.industryTitle')}
            </h2>
            <div className="card-glow overflow-hidden">
              <DataTable
                columns={industryColumns}
                data={industries}
                emptyMessage={t('factoring.concentration.noIndustries')}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
