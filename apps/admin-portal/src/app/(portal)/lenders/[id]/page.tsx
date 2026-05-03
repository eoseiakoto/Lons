'use client';

import { useParams, useRouter } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { useI18n } from '@/lib/i18n/i18n-context';
import { formatMoney } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { ArrowLeft, Banknote } from 'lucide-react';
import { ProgressBar } from '@/components/ui/progress-bar';

const LENDER_DETAIL = gql`
  query LenderDetail($id: ID!) {
    lender(id: $id) {
      id name licenseNumber country
      fundingCapacity fundingCurrency
      minInterestRate maxInterestRate
      settlementAccount riskParameters
      status createdAt updatedAt
    }
  }
`;

const LENDER_PRODUCTS = gql`
  query LenderProducts($pagination: PaginationInput) {
    products(pagination: $pagination) {
      edges {
        node {
          id code name type status lender { id }
        }
      }
    }
  }
`;

const LENDER_CONTRACTS = gql`
  query LenderContracts($pagination: PaginationInput) {
    contracts(pagination: $pagination) {
      edges {
        node {
          id contractNumber status totalOutstanding currency
          daysPastDue disbursedAmount
          customer { id fullName }
          lender { id }
        }
      }
    }
  }
`;

function maskAccount(account: string | undefined): string {
  if (!account) return '—';
  if (account.length <= 4) return account;
  return '••••' + account.slice(-4);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
    suspended: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
    inactive: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
    draft: 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]',
    discontinued: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]'}`}>
      {status}
    </span>
  );
}

export default function LenderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const id = params.id as string;

  const { data, loading, error } = useQuery(LENDER_DETAIL, { variables: { id } });
  const { data: productsData } = useQuery(LENDER_PRODUCTS, {
    variables: { pagination: { first: 200 } },
  });
  const { data: contractsData } = useQuery(LENDER_CONTRACTS, {
    variables: { pagination: { first: 200 } },
  });

  if (loading) {
    return (
      <div className="space-y-4 animate-enter">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('common.back')}
        </button>
        <div className="card-glow p-12 text-center text-[color:var(--text-tertiary)]">{t('common.loading')}</div>
      </div>
    );
  }

  if (error || !data?.lender) {
    return (
      <div className="space-y-4 animate-enter">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('common.back')}
        </button>
        <div className="card-glow p-12 text-center text-[color:var(--status-error-text)]">{t('lenders.detail.notFound')}</div>
      </div>
    );
  }

  const lender = data.lender;
  const sa = (lender.settlementAccount || {}) as Record<string, string>;
  const rp = (lender.riskParameters || {}) as Record<string, any>;

  // Filter products and contracts for this lender
  const linkedProducts = (productsData?.products?.edges || [])
    .map((e: any) => e.node)
    .filter((p: any) => p.lender?.id === id);

  const linkedContracts = (contractsData?.contracts?.edges || [])
    .map((e: any) => e.node)
    .filter((c: any) => c.lender?.id === id);

  // Funding utilization
  const totalDisbursed = linkedContracts
    .filter((c: any) => c.status === 'active' || c.status === 'closed')
    .reduce((sum: number, c: any) => sum + (Number(c.disbursedAmount) || 0), 0);
  const capacity = Number(lender.fundingCapacity) || 0;
  const utilizationPct = capacity > 0 ? Math.min(100, (totalDisbursed / capacity) * 100) : 0;

  const productColumns = [
    { header: t('products.code'), accessor: (r: any) => r.code },
    { header: t('products.name'), accessor: (r: any) => r.name },
    { header: t('products.type'), accessor: (r: any) => r.type },
    { header: t('common.status'), accessor: (r: any) => <StatusBadge status={r.status} /> },
  ];

  const contractColumns = [
    { header: t('lenders.detail.column.contractNumber'), accessor: (r: any) => r.contractNumber },
    { header: t('nav.customers'), accessor: (r: any) => r.customer?.fullName || '—' },
    {
      header: t('common.amount'),
      accessor: (r: any) => r.totalOutstanding ? formatMoney(r.totalOutstanding, r.currency || 'GHS') : '—',
    },
    { header: t('common.status'), accessor: (r: any) => <StatusBadge status={r.status} /> },
    { header: t('lenders.detail.column.dpd'), accessor: (r: any) => r.daysPastDue ?? 0 },
  ];

  return (
    <div className="relative space-y-8 animate-enter">
      <button
        onClick={() => router.back()}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      <section className="relative z-10 card-glow-hero card-glow-sweep p-7 lg:p-9">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-5">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
                border: '1px solid var(--border-default)',
              }}
            >
              <Banknote className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="live-dot" aria-hidden />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
                  {t('lenders.detail.eyebrow')}{lender.country || '—'}
                </span>
              </div>
              <h1
                className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
                style={{ fontSize: 36, lineHeight: 1.05 }}
              >
                {lender.name}
              </h1>
              {lender.licenseNumber && (
                <p className="text-[12px] font-mono text-[color:var(--text-tertiary)] mt-1">
                  {t('lenders.detail.licencePrefix')}{lender.licenseNumber}
                </p>
              )}
            </div>
          </div>
          <StatusBadge status={lender.status} />
        </div>
      </section>

      {/* Profile + Settlement + Risk — 3-column grid */}
      <section className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card-glow p-6">
          <h3 className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-medium mb-4">
            {t('lenders.detail.profile')}
          </h3>
          <dl className="space-y-3.5 text-sm">
            {[
              [t('lenders.detail.label.licenseNumber'), lender.licenseNumber || '—'],
              [t('lenders.detail.label.country'), lender.country || '—'],
              [t('lenders.detail.label.fundingCapacity'), capacity > 0 ? formatMoney(String(capacity), lender.fundingCurrency || 'GHS') : '—'],
              [t('lenders.detail.label.interestRange'), lender.minInterestRate || lender.maxInterestRate
                ? `${Number(lender.minInterestRate || 0).toFixed(1)}% – ${Number(lender.maxInterestRate || 0).toFixed(1)}%`
                : '—'],
              [t('common.created'), new Date(lender.createdAt).toLocaleDateString()],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3 items-baseline">
                <dt className="text-[color:var(--text-tertiary)] text-[12px]">{label}</dt>
                <dd className="text-[color:var(--text-primary)] tabular-nums text-right truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card-glow p-6">
          <h3 className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-medium mb-4">
            {t('lenders.detail.settlementAccount')}
          </h3>
          {Object.keys(sa).length > 0 ? (
            <dl className="space-y-3.5 text-sm">
              {[
                [t('lenders.detail.label.bank'), sa.bankName || '—'],
                [t('lenders.detail.label.account'), maskAccount(sa.accountNumber)],
                [t('lenders.detail.label.branch'), sa.branchCode || '—'],
                [t('lenders.detail.label.swift'), sa.swiftCode || '—'],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-3">
                  <dt className="text-[color:var(--text-tertiary)] text-[12px]">{label}</dt>
                  <dd className="text-[color:var(--text-primary)] font-mono">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-[color:var(--text-tertiary)]">{t('lenders.detail.noSettlementAccount')}</p>
          )}
        </div>

        <div className="card-glow p-6">
          <h3 className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-medium mb-4">
            {t('lenders.detail.riskParameters')}
          </h3>
          {Object.keys(rp).length > 0 ? (
            <dl className="space-y-3.5 text-sm">
              {Object.entries(rp).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-[color:var(--text-tertiary)] text-[12px] capitalize">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</dt>
                  <dd className="text-[color:var(--text-primary)]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-[color:var(--text-tertiary)]">{t('lenders.detail.noRiskParameters')}</p>
          )}
        </div>
      </section>

      {/* Funding utilization */}
      {capacity > 0 && (
        <section className="relative z-10 card-glow p-6">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              {t('lenders.detail.fundingUtilization')}
            </h3>
            <span
              className="text-[14px] font-semibold tabular-nums"
              style={{
                color:
                  utilizationPct > 90
                    ? 'var(--status-error-text)'
                    : utilizationPct > 70
                      ? 'var(--status-warning-text)'
                      : 'var(--accent-primary-deep)',
              }}
            >
              {utilizationPct.toFixed(1)}%
            </span>
          </div>
          <ProgressBar
            value={utilizationPct}
            max={100}
            size="md"
            variant={utilizationPct > 90 ? 'error' : utilizationPct > 70 ? 'warning' : 'success'}
          />
          <div className="flex justify-between mt-3 text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
            <span>{t('lenders.detail.disbursedPrefix')}{formatMoney(String(totalDisbursed), lender.fundingCurrency || 'GHS')}</span>
            <span>{t('lenders.detail.capacityPrefix')}{formatMoney(String(capacity), lender.fundingCurrency || 'GHS')}</span>
          </div>
        </section>
      )}

      {/* Linked Products */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="flex items-baseline justify-between px-6 py-5 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('lenders.detail.linkedProducts')}
          </h3>
          <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
            {linkedProducts.length}
          </span>
        </div>
        <DataTable
          columns={productColumns}
          data={linkedProducts}
          onRowClick={(p: any) => router.push(`/products/${p.id}`)}
          emptyMessage={t('lenders.detail.noLinkedProducts')}
        />
      </section>

      {/* Linked Contracts */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="flex items-baseline justify-between px-6 py-5 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('lenders.detail.linkedContracts')}
          </h3>
          <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
            {linkedContracts.length}
          </span>
        </div>
        <DataTable
          columns={contractColumns}
          data={linkedContracts}
          onRowClick={(c: any) => router.push(`/loans/contracts/${c.id}`)}
          emptyMessage={t('lenders.detail.noLinkedContracts')}
        />
      </section>
    </div>
  );
}
