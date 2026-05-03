'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatMoney, formatDate } from '@/lib/utils';
import { compare } from '@/lib/decimal';
import { DebtorStatusBadge } from '@/components/debtors/debtor-status-badge';
import { DebtorRiskBadge } from '@/components/debtors/debtor-risk-badge';
import { InvoiceStatusBadge } from '@/components/factoring/invoice-status-badge';
import {
  DEBTOR_QUERY,
  DEBTOR_RISK_ASSESSMENT_QUERY,
  INVOICES_QUERY,
  type IDebtor,
  type IDebtorRiskResult,
  type IInvoice,
} from '@/lib/graphql/factoring';

interface InfoCellProps {
  label: string;
  value: React.ReactNode;
}

function InfoCell({ label, value }: InfoCellProps) {
  return (
    <div className="card-glow p-4">
      <div className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-1">
        {label}
      </div>
      <div className="text-sm text-[color:var(--text-primary)] font-medium">
        {value}
      </div>
    </div>
  );
}

interface FactorRowProps {
  label: string;
  /** Decimal-string in [0, 100]. */
  value?: string;
}

function FactorRow({ label, value }: FactorRowProps) {
  // Banker-rounded percent for the bar; pass through as decimal-string for tabular display.
  const numeric = value ? Math.max(0, Math.min(100, Number(value))) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
          {label}
        </span>
        <span className="text-[13px] font-semibold tabular-nums text-[color:var(--text-primary)]">
          {value ?? '—'}
        </span>
      </div>
      <ProgressBar
        value={numeric}
        max={100}
        size="sm"
        variant={numeric >= 80 ? 'success' : numeric >= 50 ? 'warning' : 'error'}
      />
    </div>
  );
}

export default function DebtorDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { t } = useI18n();

  const { data: debtorData, loading: debtorLoading } = useQuery(DEBTOR_QUERY, {
    variables: { debtorId: id },
  });

  const {
    data: riskData,
    loading: riskLoading,
    refetch: refetchRisk,
  } = useQuery(DEBTOR_RISK_ASSESSMENT_QUERY, {
    variables: { debtorId: id },
    fetchPolicy: 'cache-and-network',
  });

  const { data: invoicesData, loading: invoicesLoading } = useQuery(
    INVOICES_QUERY,
    {
      variables: {
        filters: { debtorId: id },
        pagination: { first: 50 },
      },
      fetchPolicy: 'cache-and-network',
    },
  );

  const debtor = debtorData?.debtor as IDebtor | undefined;
  const risk = riskData?.debtorRiskAssessment as IDebtorRiskResult | undefined;
  const invoices: IInvoice[] =
    invoicesData?.invoices?.edges?.map((edge: { node: IInvoice }) => edge.node) ??
    [];

  const exposureUtilization = useMemo(() => {
    if (!debtor?.exposureLimit) return null;
    if (compare(debtor.exposureLimit, '0') <= 0) return null;
    const total = Number(debtor.totalExposure || '0');
    const limit = Number(debtor.exposureLimit);
    if (limit <= 0) return null;
    return Math.max(0, Math.min(100, (total / limit) * 100));
  }, [debtor?.totalExposure, debtor?.exposureLimit]);

  if (debtorLoading) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <div className="relative z-10 card-glow p-12 text-center text-[color:var(--text-tertiary)]">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!debtor) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <PageHeader
          title={t('debtors.title')}
          subtitle={t('debtors.detail.notFound')}
        />
        <Link
          href="/debtors"
          className="relative z-10 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('debtors.title')}
        </Link>
      </div>
    );
  }

  // Guess display currency from the first invoice; fall back to GHS so the
  // exposure card never renders blank.
  const displayCurrency = invoices[0]?.currency ?? 'GHS';

  const invoiceColumns = [
    {
      header: t('factoring.list.column.invoiceNumber'),
      accessor: (inv: IInvoice) => (
        <Link
          href={`/loans/factoring/${inv.id}`}
          className="font-mono text-xs text-[color:var(--text-primary)] hover:text-[color:var(--accent-primary)] transition-colors"
        >
          {inv.invoiceNumber}
        </Link>
      ),
    },
    {
      header: t('factoring.list.column.faceValue'),
      accessor: (inv: IInvoice) => (
        <span className="tabular-nums">{formatMoney(inv.faceValue, inv.currency)}</span>
      ),
    },
    {
      header: t('factoring.list.column.advancedAmount'),
      accessor: (inv: IInvoice) => (
        <span className="tabular-nums">
          {inv.advancedAmount
            ? formatMoney(inv.advancedAmount, inv.currency)
            : '—'}
        </span>
      ),
    },
    {
      header: t('factoring.list.column.status'),
      accessor: (inv: IInvoice) => <InvoiceStatusBadge status={inv.status} />,
    },
    {
      header: t('factoring.list.column.dueDate'),
      accessor: (inv: IInvoice) => (
        <span className="text-[12px] tabular-nums">{formatDate(inv.dueDate)}</span>
      ),
    },
  ];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <Link
        href="/debtors"
        className="relative z-10 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('debtors.title')}
      </Link>

      <PageHeader
        eyebrow={debtor.country}
        title={debtor.companyName}
        subtitle={debtor.tradingName ?? undefined}
        actions={<DebtorStatusBadge status={debtor.status} />}
      />

      {/* Section 1 — Contact info. */}
      <section className="relative z-10 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {t('debtors.detail.section.contact')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoCell
            label={t('debtors.form.contactName')}
            value={debtor.contactName || '—'}
          />
          <InfoCell
            label={t('debtors.form.contactEmail')}
            value={debtor.contactEmail || '—'}
          />
          <InfoCell
            label={t('debtors.form.contactPhone')}
            value={debtor.contactPhone || '—'}
          />
          <InfoCell
            label={t('debtors.form.registrationNumber')}
            value={debtor.registrationNumber || '—'}
          />
          <InfoCell
            label={t('debtors.form.taxId')}
            value={debtor.taxId || '—'}
          />
          <InfoCell
            label={t('debtors.form.industrySector')}
            value={debtor.industrySector || '—'}
          />
        </div>
      </section>

      {/* Section 2 — Risk assessment. */}
      <section className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
            {t('debtors.detail.section.risk')}
          </h2>
          <button
            type="button"
            onClick={() => refetchRisk()}
            disabled={riskLoading}
            className="glass-button text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5${riskLoading ? ' animate-spin' : ''}`} />
            {t('debtors.detail.reassessRisk')}
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card-glow p-6 space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-[44px] font-semibold tabular-nums tracking-[-0.025em] text-[color:var(--text-primary)]">
                {risk?.score ?? debtor.internalRiskScore ?? '—'}
              </span>
              <DebtorRiskBadge
                score={risk?.score ?? debtor.internalRiskScore ?? undefined}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
              <InfoCell
                label={t('debtors.detail.externalRating')}
                value={debtor.externalCreditRating || '—'}
              />
              <InfoCell
                label={t('debtors.detail.reliability')}
                value={risk ? `${risk.reliabilityPercent}%` : '—'}
              />
            </div>
          </div>
          <div className="card-glow p-6 space-y-3">
            <h3 className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-3">
              {t('debtors.detail.factorBreakdown')}
            </h3>
            <FactorRow
              label={t('debtors.detail.factor.paymentHistory')}
              value={risk?.factors.paymentHistory}
            />
            <FactorRow
              label={t('debtors.detail.factor.industry')}
              value={risk?.factors.industry}
            />
            <FactorRow
              label={t('debtors.detail.factor.country')}
              value={risk?.factors.country}
            />
            <FactorRow
              label={t('debtors.detail.factor.default')}
              value={risk?.factors.default}
            />
          </div>
        </div>
      </section>

      {/* Section 3 — Payment history summary. */}
      <section className="relative z-10 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {t('debtors.detail.section.paymentHistory')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoCell
            label={t('debtors.detail.avgPaymentDays')}
            value={
              risk?.averagePaymentDays != null
                ? t('debtors.detail.daysCount', {
                    count: risk.averagePaymentDays,
                  })
                : debtor.averagePaymentDays != null
                  ? t('debtors.detail.daysCount', {
                      count: debtor.averagePaymentDays,
                    })
                  : '—'
            }
          />
          <InfoCell
            label={t('debtors.detail.reliability')}
            value={risk ? `${risk.reliabilityPercent}%` : '—'}
          />
          <InfoCell
            label={t('debtors.detail.disputeCount')}
            value={
              invoices.filter((inv) => inv.status === 'disputed').length
            }
          />
          <InfoCell
            label={t('debtors.detail.defaultCount')}
            value={
              invoices.filter((inv) => inv.status === 'defaulted').length
            }
          />
        </div>
      </section>

      {/* Exposure card. */}
      <section className="relative z-10">
        <div className="card-glow p-6 space-y-3">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('debtors.detail.exposureTitle')}
          </h3>
          <div className="flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tabular-nums text-[color:var(--text-primary)]">
              {formatMoney(debtor.totalExposure || '0', displayCurrency)}
            </span>
            <span className="text-[13px] text-[color:var(--text-tertiary)] tabular-nums">
              {debtor.exposureLimit
                ? t('debtors.detail.exposureOf', {
                    limit: formatMoney(debtor.exposureLimit, displayCurrency),
                  })
                : t('debtors.detail.noLimitSet')}
            </span>
          </div>
          {exposureUtilization !== null && (
            <ProgressBar
              value={exposureUtilization}
              max={100}
              size="md"
              variant={
                exposureUtilization < 60
                  ? 'success'
                  : exposureUtilization < 80
                    ? 'warning'
                    : 'error'
              }
              rightLabel={`${exposureUtilization.toFixed(1)}%`}
              label={t('debtors.detail.exposureUtilization')}
            />
          )}
        </div>
      </section>

      {/* Section 4 — Invoices. */}
      <section className="relative z-10 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {t('debtors.detail.section.invoices')}{' '}
          <span className="ml-2 text-[color:var(--text-tertiary)] normal-case tracking-normal">
            {invoices.length}
          </span>
        </h2>
        <div className="card-glow overflow-hidden">
          {invoicesLoading && invoices.length === 0 ? (
            <div className="p-8 text-center text-[color:var(--text-tertiary)] text-sm">
              {t('common.loading')}
            </div>
          ) : (
            <DataTable
              columns={invoiceColumns}
              data={invoices}
              emptyMessage={t('debtors.detail.noInvoices')}
            />
          )}
        </div>
      </section>
    </div>
  );
}
