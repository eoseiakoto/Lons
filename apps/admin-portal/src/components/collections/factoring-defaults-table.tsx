'use client';

import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { useI18n } from '@/lib/i18n/i18n-context';
import { formatDate, formatMoney } from '@/lib/utils';

const DEFAULTED_INVOICES_QUERY = gql`
  query DefaultedInvoices($filters: InvoiceFiltersInput, $pagination: FactoringPaginationInput) {
    invoices(filters: $filters, pagination: $pagination) {
      edges {
        node {
          id
          invoiceNumber
          sellerId
          debtorId
          faceValue
          amountReceived
          currency
          status
          dueDate
          recourseType
          defaultedAt
        }
      }
      totalCount
    }
  }
`;

interface DefaultedInvoiceNode {
  id: string;
  invoiceNumber: string;
  sellerId: string;
  debtorId: string;
  faceValue: string;
  amountReceived?: string | null;
  currency: string;
  status: string;
  dueDate: string;
  recourseType: 'with_recourse' | 'without_recourse';
  defaultedAt?: string | null;
}

const GRACE_PERIOD_DAYS = 30;

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

interface RecoveryContext {
  /** Who collection is being pursued from. */
  target: 'debtor' | 'seller' | 'write_off';
  /** Days since invoice defaulted (>=0) or 0 if defaultedAt unknown. */
  daysSinceDefault: number;
  /** Days remaining in grace period (negative when elapsed). */
  graceRemainingDays: number;
  graceElapsed: boolean;
  /** UTC date when grace period would end (used in tooltip). */
  graceEndDate?: Date;
}

function computeRecoveryContext(inv: DefaultedInvoiceNode): RecoveryContext {
  const defaulted = inv.defaultedAt ? new Date(inv.defaultedAt) : null;
  const now = new Date();
  const daysSinceDefault = defaulted ? Math.max(0, daysBetween(now, defaulted)) : 0;
  const graceEndDate = defaulted
    ? new Date(defaulted.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    : undefined;
  const graceRemainingDays = graceEndDate ? daysBetween(graceEndDate, now) : -1;
  const graceElapsed = graceRemainingDays < 0;

  // Without recourse: write-off on lender — there's no seller to collect from.
  if (inv.recourseType === 'without_recourse') {
    return {
      target: 'write_off',
      daysSinceDefault,
      graceRemainingDays,
      graceElapsed,
      graceEndDate,
    };
  }
  // With recourse pre-grace: still pursue the debtor.
  // With recourse + grace elapsed: pursue the seller (recourse trigger).
  return {
    target: graceElapsed ? 'seller' : 'debtor',
    daysSinceDefault,
    graceRemainingDays,
    graceElapsed,
    graceEndDate,
  };
}

function RecourseBadge({ type }: { type: 'with_recourse' | 'without_recourse' }) {
  const { t } = useI18n();
  const cls =
    type === 'with_recourse'
      ? 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]'
      : 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]';
  const label =
    type === 'with_recourse'
      ? t('collections.factoringDefaults.recourse.withRecourse')
      : t('collections.factoringDefaults.recourse.withoutRecourse');
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function GraceBadge({ ctx }: { ctx: RecoveryContext }) {
  const { t } = useI18n();
  if (ctx.target === 'write_off') {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]">
        {t('collections.factoringDefaults.grace.nonRecourseWriteOff')}
      </span>
    );
  }
  if (ctx.graceElapsed) {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]">
        {t('collections.factoringDefaults.grace.elapsed')}
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]">
      {t('collections.factoringDefaults.grace.inGrace', { days: ctx.graceRemainingDays })}
    </span>
  );
}

function TargetCell({
  ctx,
  sellerId,
  debtorId,
}: {
  ctx: RecoveryContext;
  sellerId: string;
  debtorId: string;
}) {
  const { t } = useI18n();
  // The recovery target is highlighted; the other party is shown muted.
  const targetIsSeller = ctx.target === 'seller';
  const targetIsDebtor = ctx.target === 'debtor';
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
          {t('collections.factoringDefaults.column.seller')}
        </span>
        <Link
          href={`/customers/${sellerId}`}
          className={
            targetIsSeller
              ? 'text-[color:var(--status-error-text)] font-semibold hover:underline'
              : 'text-[color:var(--text-secondary)] hover:underline'
          }
        >
          {sellerId.slice(0, 8)}…
        </Link>
        {targetIsSeller && (
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--status-error-text)] font-semibold">
            {t('collections.factoringDefaults.recoveryTarget')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
          {t('collections.factoringDefaults.column.debtor')}
        </span>
        <Link
          href={`/debtors/${debtorId}`}
          className={
            targetIsDebtor
              ? 'text-[color:var(--status-error-text)] font-semibold hover:underline'
              : 'text-[color:var(--text-secondary)] hover:underline'
          }
        >
          {debtorId.slice(0, 8)}…
        </Link>
        {targetIsDebtor && (
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--status-error-text)] font-semibold">
            {t('collections.factoringDefaults.recoveryTarget')}
          </span>
        )}
      </div>
    </div>
  );
}

export function FactoringDefaultsTable() {
  const { t } = useI18n();
  const { data, loading, error } = useQuery(DEFAULTED_INVOICES_QUERY, {
    variables: { filters: { status: 'defaulted' }, pagination: { first: 50 } },
    fetchPolicy: 'cache-and-network',
  });

  const invoices: DefaultedInvoiceNode[] =
    data?.invoices?.edges?.map((e: { node: DefaultedInvoiceNode }) => e.node) ?? [];
  const totalCount: number = data?.invoices?.totalCount ?? invoices.length;

  // Partition for the summary header.
  const debtorCollection = invoices.filter((inv) => {
    const ctx = computeRecoveryContext(inv);
    return ctx.target === 'debtor';
  });
  const sellerCollection = invoices.filter((inv) => {
    const ctx = computeRecoveryContext(inv);
    return ctx.target === 'seller';
  });

  return (
    <section className="relative z-10 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('collections.factoringDefaults.title')}
          </h2>
          <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
            {t('collections.factoringDefaults.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[color:var(--text-tertiary)]">
          <span>
            {t('collections.factoringDefaults.summary.debtorCollection', {
              count: debtorCollection.length,
            })}
          </span>
          <span>·</span>
          <span>
            {t('collections.factoringDefaults.summary.sellerCollection', {
              count: sellerCollection.length,
            })}
          </span>
          <span>·</span>
          <span>{t('collections.factoringDefaults.summary.total', { count: totalCount })}</span>
        </div>
      </div>

      <div className="card-glow overflow-hidden">
        {loading && invoices.length === 0 ? (
          <p className="text-sm text-[color:var(--text-tertiary)] py-8 text-center">
            {t('common.loading')}
          </p>
        ) : error ? (
          <p className="text-sm text-[color:var(--status-error-text)] py-8 text-center">
            {t('collections.factoringDefaults.loadError')}
          </p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-[color:var(--text-tertiary)] py-8 text-center">
            {t('collections.factoringDefaults.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-clean w-full text-sm">
              <thead>
                <tr className="text-left" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="pb-3 px-4 text-[13px] font-medium text-[color:var(--text-secondary)]">
                    {t('collections.factoringDefaults.column.invoice')}
                  </th>
                  <th className="pb-3 px-4 text-[13px] font-medium text-[color:var(--text-secondary)]">
                    {t('collections.factoringDefaults.column.parties')}
                  </th>
                  <th className="pb-3 px-4 text-right text-[13px] font-medium text-[color:var(--text-secondary)]">
                    {t('collections.factoringDefaults.column.faceValue')}
                  </th>
                  <th className="pb-3 px-4 text-right text-[13px] font-medium text-[color:var(--text-secondary)]">
                    {t('collections.factoringDefaults.column.outstanding')}
                  </th>
                  <th className="pb-3 px-4 text-[13px] font-medium text-[color:var(--text-secondary)]">
                    {t('collections.factoringDefaults.column.recourseType')}
                  </th>
                  <th className="pb-3 px-4 text-center text-[13px] font-medium text-[color:var(--text-secondary)]">
                    {t('collections.factoringDefaults.column.daysSinceDefault')}
                  </th>
                  <th className="pb-3 px-4 text-[13px] font-medium text-[color:var(--text-secondary)]">
                    {t('collections.factoringDefaults.column.graceStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const ctx = computeRecoveryContext(inv);
                  const outstanding =
                    Number(inv.faceValue) - Number(inv.amountReceived ?? 0);
                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-[color:var(--bg-muted)] transition-colors"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/loans/factoring/${inv.id}`}
                          className="font-mono text-xs text-[color:var(--accent-primary-deep)] hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                        <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">
                          {t('collections.factoringDefaults.column.dueDate')}:{' '}
                          {formatDate(inv.dueDate)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <TargetCell
                          ctx={ctx}
                          sellerId={inv.sellerId}
                          debtorId={inv.debtorId}
                        />
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-[color:var(--text-secondary)]">
                        {formatMoney(inv.faceValue, inv.currency)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-[color:var(--text-primary)] font-semibold">
                        {formatMoney(outstanding.toFixed(2), inv.currency)}
                      </td>
                      <td className="py-3 px-4">
                        <RecourseBadge type={inv.recourseType} />
                      </td>
                      <td className="py-3 px-4 text-center text-[color:var(--text-primary)] tabular-nums">
                        {inv.defaultedAt
                          ? t('collections.factoringDefaults.daysShort', {
                              days: ctx.daysSinceDefault,
                            })
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <GraceBadge ctx={ctx} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
