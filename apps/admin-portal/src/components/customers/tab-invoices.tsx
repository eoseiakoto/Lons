'use client';

import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { useI18n } from '@/lib/i18n/i18n-context';
import { formatDate, formatMoney } from '@/lib/utils';

const SELLER_INVOICES_QUERY = gql`
  query SellerInvoices($filters: InvoiceFiltersInput, $pagination: FactoringPaginationInput) {
    invoices(filters: $filters, pagination: $pagination) {
      edges {
        node {
          id
          invoiceNumber
          debtorId
          faceValue
          advancedAmount
          netDisbursement
          currency
          status
          dueDate
          recourseType
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

interface InvoiceNode {
  id: string;
  invoiceNumber: string;
  debtorId: string;
  faceValue: string;
  advancedAmount?: string | null;
  netDisbursement?: string | null;
  currency: string;
  status: string;
  dueDate: string;
  recourseType: string;
}

/**
 * Inline status pill — TODO(Phase 5A): replace with shared
 * <InvoiceStatusBadge /> from `components/factoring/` once Phase 5A
 * extracts it.
 */
function InvoiceStatusPill({ status }: { status: string }) {
  const cls = (() => {
    switch (status) {
      case 'settled':
      case 'reserve_released':
      case 'payment_received':
        return 'pill pill-success';
      case 'funded':
      case 'debtor_notified':
      case 'offer_accepted':
        return 'pill pill-info';
      case 'submitted':
      case 'under_review':
      case 'verified':
      case 'offer_generated':
        return 'pill pill-warning';
      case 'defaulted':
      case 'rejected':
      case 'cancelled':
      case 'disputed':
        return 'pill pill-error';
      default:
        return 'pill pill-neutral';
    }
  })();
  return <span className={cls}>{status.replace(/_/g, ' ')}</span>;
}

interface TabInvoicesProps {
  customerId: string;
}

export function TabInvoices({ customerId }: TabInvoicesProps) {
  const { t } = useI18n();
  const { data, loading, error } = useQuery(SELLER_INVOICES_QUERY, {
    variables: { filters: { sellerId: customerId }, pagination: { first: 50 } },
    skip: !customerId,
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <div className="card-glow p-6 text-sm text-[color:var(--text-tertiary)]">
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-glow p-6 text-sm text-[color:var(--status-error-text)]">
        {t('customers.invoices.loadError')}
      </div>
    );
  }

  const invoices: InvoiceNode[] =
    data?.invoices?.edges?.map((e: { node: InvoiceNode }) => e.node) ?? [];
  const totalCount: number = data?.invoices?.totalCount ?? invoices.length;

  if (invoices.length === 0) {
    return (
      <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">
        {t('customers.invoices.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
          {t('customers.invoices.title')}
        </h3>
        <span className="text-xs text-[color:var(--text-tertiary)]">
          {t('customers.invoices.totalCount', { count: totalCount })}
        </span>
      </div>

      <div className="card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-clean w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">
                  {t('customers.invoices.column.invoiceNumber')}
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">
                  {t('customers.invoices.column.debtor')}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">
                  {t('customers.invoices.column.faceValue')}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">
                  {t('customers.invoices.column.advanceAmount')}
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">
                  {t('customers.invoices.column.netDisbursement')}
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">
                  {t('customers.invoices.column.status')}
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">
                  {t('customers.invoices.column.dueDate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
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
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/debtors/${inv.debtorId}`}
                      className="text-[color:var(--accent-primary-deep)] hover:underline"
                    >
                      {inv.debtorId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[color:var(--text-primary)]">
                    {formatMoney(inv.faceValue, inv.currency)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[color:var(--text-primary)]">
                    {inv.advancedAmount
                      ? formatMoney(inv.advancedAmount, inv.currency)
                      : '—'}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[color:var(--text-primary)]">
                    {inv.netDisbursement
                      ? formatMoney(inv.netDisbursement, inv.currency)
                      : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <InvoiceStatusPill status={inv.status} />
                  </td>
                  <td className="py-3 px-4 text-[color:var(--text-secondary)]">
                    {formatDate(inv.dueDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
