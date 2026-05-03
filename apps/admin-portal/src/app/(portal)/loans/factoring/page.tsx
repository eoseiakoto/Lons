'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { Filter, LayoutGrid, ListIcon, BarChart3 } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { FilterPill } from '@/components/ui/filter-pill';
import { InvoiceList } from '@/components/factoring/invoice-list';
import { InvoiceKanban } from '@/components/factoring/invoice-kanban';
import { VerifyInvoiceModal } from '@/components/factoring/verify-invoice-modal';
import { RecordPaymentModal } from '@/components/factoring/record-payment-modal';
import {
  INVOICES_QUERY,
  type IInvoice,
  type InvoiceStatus,
} from '@/lib/graphql/factoring';

type ViewMode = 'list' | 'kanban';

const PAGE_SIZE = 100;

/**
 * Invoice factoring pipeline page. Two view modes (list / kanban), broad
 * filter set (status, seller, debtor, date range, amount range, search by
 * invoice number).
 */
export default function FactoringPipelinePage() {
  const { t } = useI18n();

  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<'' | InvoiceStatus>('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [debtorFilter, setDebtorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [search, setSearch] = useState('');

  // Verification & record-payment modals are owned at the page level so the
  // list view's quick actions can open them without each row re-mounting.
  const [verifyTarget, setVerifyTarget] = useState<IInvoice | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<IInvoice | null>(null);

  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (statusFilter) f.status = statusFilter;
    if (sellerFilter.trim()) f.sellerId = sellerFilter.trim();
    if (debtorFilter.trim()) f.debtorId = debtorFilter.trim();
    if (dateFrom) f.dateRangeFrom = dateFrom;
    if (dateTo) f.dateRangeTo = dateTo;
    if (amountMin.trim()) f.amountMin = amountMin.trim();
    if (amountMax.trim()) f.amountMax = amountMax.trim();
    return Object.keys(f).length > 0 ? f : undefined;
  }, [
    statusFilter,
    sellerFilter,
    debtorFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
  ]);

  const { data, loading, refetch } = useQuery(INVOICES_QUERY, {
    variables: { filters, pagination: { first: PAGE_SIZE } },
    fetchPolicy: 'cache-and-network',
  });

  const allInvoices: IInvoice[] =
    data?.invoices?.edges?.map((edge: { node: IInvoice }) => edge.node) ?? [];
  const totalCount: number = data?.invoices?.totalCount ?? 0;

  const invoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allInvoices;
    return allInvoices.filter((inv) =>
      inv.invoiceNumber.toLowerCase().includes(q),
    );
  }, [allInvoices, search]);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('factoring.eyebrow')}
        title={t('factoring.pipelineTitle')}
        subtitle={
          totalCount > 0
            ? t('factoring.pipelineSubtitleWithCount', { count: totalCount })
            : t('factoring.pipelineSubtitle')
        }
        actions={
          <Link
            href="/loans/factoring/concentration"
            className="glass-button text-sm inline-flex items-center gap-1.5"
          >
            <BarChart3 className="w-4 h-4" />
            {t('factoring.viewConcentration')}
          </Link>
        }
      />

      {/* Filter row. */}
      <section className="relative z-10 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">{t('common.filter')}</span>
        </div>
        <FilterPill
          label={t('factoring.filter.byStatus')}
          options={[
            { value: '', label: t('common.allStatuses') },
            { value: 'submitted', label: t('factoring.status.submitted') },
            { value: 'under_review', label: t('factoring.status.underReview') },
            { value: 'verified', label: t('factoring.status.verified') },
            { value: 'offer_generated', label: t('factoring.status.offerGenerated') },
            { value: 'offer_accepted', label: t('factoring.status.offerAccepted') },
            { value: 'funded', label: t('factoring.status.funded') },
            { value: 'debtor_notified', label: t('factoring.status.debtorNotified') },
            { value: 'payment_received', label: t('factoring.status.paymentReceived') },
            { value: 'reserve_released', label: t('factoring.status.reserveReleased') },
            { value: 'settled', label: t('factoring.status.settled') },
            { value: 'disputed', label: t('factoring.status.disputed') },
            { value: 'defaulted', label: t('factoring.status.defaulted') },
            { value: 'cancelled', label: t('factoring.status.cancelled') },
            { value: 'rejected', label: t('factoring.status.rejected') },
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as '' | InvoiceStatus)}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('factoring.filter.searchPlaceholder')}
          className="glass-input text-sm flex-1 min-w-[200px]"
        />
        <div className="ml-auto inline-flex rounded-lg border border-[color:var(--border-subtle)] overflow-hidden">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`px-3 py-1.5 text-[12px] inline-flex items-center gap-1.5 transition-colors ${
              view === 'list'
                ? 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)]'
                : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)]'
            }`}
            aria-pressed={view === 'list'}
          >
            <ListIcon className="w-3.5 h-3.5" />
            {t('factoring.view.list')}
          </button>
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={`px-3 py-1.5 text-[12px] inline-flex items-center gap-1.5 transition-colors ${
              view === 'kanban'
                ? 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)]'
                : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)]'
            }`}
            aria-pressed={view === 'kanban'}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {t('factoring.view.kanban')}
          </button>
        </div>
      </section>

      {/* Secondary filters: party UUIDs, date range, amount range. */}
      <section className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          type="text"
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          placeholder={t('factoring.filter.sellerPlaceholder')}
          className="glass-input text-sm font-mono"
        />
        <input
          type="text"
          value={debtorFilter}
          onChange={(e) => setDebtorFilter(e.target.value)}
          placeholder={t('factoring.filter.debtorPlaceholder')}
          className="glass-input text-sm font-mono"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="glass-input text-sm flex-1"
            aria-label={t('factoring.filter.dateFromLabel')}
          />
          <span className="text-[12px] text-[color:var(--text-tertiary)]">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="glass-input text-sm flex-1"
            aria-label={t('factoring.filter.dateToLabel')}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            placeholder={t('factoring.filter.amountMinPlaceholder')}
            className="glass-input text-sm flex-1 tabular-nums"
            aria-label={t('factoring.filter.amountMinLabel')}
          />
          <span className="text-[12px] text-[color:var(--text-tertiary)]">→</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            placeholder={t('factoring.filter.amountMaxPlaceholder')}
            className="glass-input text-sm flex-1 tabular-nums"
            aria-label={t('factoring.filter.amountMaxLabel')}
          />
        </div>
      </section>

      <div className="relative z-10">
        {view === 'list' ? (
          <InvoiceList
            invoices={invoices}
            loading={loading}
            onVerify={setVerifyTarget}
            onRecordPayment={setPaymentTarget}
          />
        ) : (
          <InvoiceKanban invoices={invoices} loading={loading} />
        )}
      </div>

      {verifyTarget && (
        <VerifyInvoiceModal
          invoiceId={verifyTarget.id}
          open={true}
          approving={true}
          onClose={() => setVerifyTarget(null)}
          onResolved={() => {
            void refetch();
          }}
        />
      )}
      {paymentTarget && (
        <RecordPaymentModal
          invoiceId={paymentTarget.id}
          faceValue={paymentTarget.faceValue}
          currency={paymentTarget.currency}
          open={true}
          onClose={() => setPaymentTarget(null)}
          onResolved={() => {
            void refetch();
          }}
        />
      )}
    </div>
  );
}
