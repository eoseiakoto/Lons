'use client';

import Link from 'next/link';

import { useI18n } from '@/lib/i18n/i18n-context';
import { formatMoney, formatDate } from '@/lib/utils';
import type { IInvoice, InvoiceStatus } from '@/lib/graphql/factoring';
import { InvoiceStatusBadge } from './invoice-status-badge';

interface InvoiceKanbanProps {
  invoices: IInvoice[];
  loading: boolean;
}

/**
 * Kanban view of the invoice pipeline. Columns are the seven primary
 * lifecycle states (terminal/branch states are collapsed into a "completed"
 * column). Each card links into the invoice detail page.
 */
export function InvoiceKanban({ invoices, loading }: InvoiceKanbanProps) {
  const { t } = useI18n();

  const COLUMNS: Array<{ key: string; statuses: InvoiceStatus[]; labelKey: string }> = [
    {
      key: 'submitted',
      statuses: ['submitted', 'under_review'],
      labelKey: 'factoring.kanban.column.review',
    },
    {
      key: 'verified',
      statuses: ['verified'],
      labelKey: 'factoring.kanban.column.verified',
    },
    {
      key: 'offer',
      statuses: ['offer_generated', 'offer_accepted'],
      labelKey: 'factoring.kanban.column.offer',
    },
    {
      key: 'funded',
      statuses: ['funded', 'debtor_notified'],
      labelKey: 'factoring.kanban.column.funded',
    },
    {
      key: 'payment',
      statuses: ['payment_received', 'reserve_released'],
      labelKey: 'factoring.kanban.column.payment',
    },
    {
      key: 'completed',
      statuses: ['settled'],
      labelKey: 'factoring.kanban.column.completed',
    },
    {
      key: 'issues',
      statuses: ['disputed', 'defaulted', 'cancelled', 'rejected'],
      labelKey: 'factoring.kanban.column.issues',
    },
  ];

  if (loading && invoices.length === 0) {
    return (
      <div className="card-glow p-12 text-center text-[color:var(--text-tertiary)] text-sm">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const items = invoices.filter((inv) => col.statuses.includes(inv.status));
        return (
          <div
            key={col.key}
            className="card-glow p-4 flex flex-col gap-3 min-h-[160px]"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-[12px] uppercase tracking-wider text-[color:var(--text-secondary)] font-semibold">
                {t(col.labelKey)}
              </h3>
              <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <p className="text-[12px] text-[color:var(--text-tertiary)] italic">
                {t('factoring.kanban.empty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/loans/factoring/${inv.id}`}
                      className="block card p-3 hover:bg-[color:var(--bg-hover)] transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[11px] text-[color:var(--text-primary)]">
                          {inv.invoiceNumber}
                        </span>
                        <InvoiceStatusBadge status={inv.status} />
                      </div>
                      <p className="text-[13px] tabular-nums text-[color:var(--text-primary)] font-semibold mt-1.5">
                        {formatMoney(inv.faceValue, inv.currency)}
                      </p>
                      <p className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums mt-0.5">
                        {t('factoring.kanban.dueOn', {
                          date: formatDate(inv.dueDate),
                        })}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
