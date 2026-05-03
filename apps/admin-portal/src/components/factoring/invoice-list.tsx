'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { formatMoney, formatDate } from '@/lib/utils';
import type { IInvoice } from '@/lib/graphql/factoring';
import { InvoiceStatusBadge } from './invoice-status-badge';

interface InvoiceListProps {
  invoices: IInvoice[];
  loading: boolean;
  onVerify: (invoice: IInvoice) => void;
  onRecordPayment: (invoice: IInvoice) => void;
}

/**
 * Table view of the invoice pipeline. Computes "days to due" / "days past due"
 * client-side from the invoice's `dueDate` against today (UTC). Quick actions
 * — verify (under_review) / record payment (debtor_notified) — are only shown
 * when the row is in the right state.
 */
export function InvoiceList({
  invoices,
  loading,
  onVerify,
  onRecordPayment,
}: InvoiceListProps) {
  const { t } = useI18n();

  if (loading && invoices.length === 0) {
    return (
      <div className="card-glow p-12 text-center text-[color:var(--text-tertiary)] text-sm">
        {t('common.loading')}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="card-glow p-12 text-center text-[color:var(--text-tertiary)] text-sm">
        {t('factoring.list.empty')}
      </div>
    );
  }

  return (
    <div className="card-glow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border-subtle)]">
              <Th>{t('factoring.list.column.invoiceNumber')}</Th>
              <Th>{t('factoring.list.column.seller')}</Th>
              <Th>{t('factoring.list.column.debtor')}</Th>
              <Th>{t('factoring.list.column.faceValue')}</Th>
              <Th>{t('factoring.list.column.advancedAmount')}</Th>
              <Th>{t('factoring.list.column.status')}</Th>
              <Th>{t('factoring.list.column.dueDate')}</Th>
              <Th>{t('factoring.list.column.dueTiming')}</Th>
              <Th className="w-px">{t('common.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr
                key={inv.id}
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
              >
                <Td>
                  <Link
                    href={`/loans/factoring/${inv.id}`}
                    className="font-mono text-[12px] text-[color:var(--text-primary)] hover:text-[color:var(--accent-primary)] transition-colors inline-flex items-center gap-1"
                  >
                    {inv.invoiceNumber}
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </Td>
                <Td>
                  <Link
                    href={`/customers/${inv.sellerId}`}
                    className="text-[color:var(--text-secondary)] hover:text-[color:var(--accent-primary)] transition-colors text-[12px] font-mono"
                  >
                    {shortenId(inv.sellerId)}
                  </Link>
                </Td>
                <Td>
                  <Link
                    href={`/debtors/${inv.debtorId}`}
                    className="text-[color:var(--text-secondary)] hover:text-[color:var(--accent-primary)] transition-colors text-[12px] font-mono"
                  >
                    {shortenId(inv.debtorId)}
                  </Link>
                </Td>
                <Td>
                  <span className="text-[color:var(--text-primary)] tabular-nums font-semibold">
                    {formatMoney(inv.faceValue, inv.currency)}
                  </span>
                </Td>
                <Td>
                  <span className="text-[color:var(--text-secondary)] tabular-nums">
                    {inv.advancedAmount
                      ? formatMoney(inv.advancedAmount, inv.currency)
                      : '—'}
                  </span>
                </Td>
                <Td>
                  <InvoiceStatusBadge status={inv.status} />
                </Td>
                <Td>
                  <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                    {formatDate(inv.dueDate)}
                  </span>
                </Td>
                <Td>
                  <DueTimingCell dueDate={inv.dueDate} />
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-2 text-xs">
                    {inv.status === 'under_review' && (
                      <button
                        type="button"
                        onClick={() => onVerify(inv)}
                        className="text-[color:var(--accent-primary-deep)] hover:opacity-80 transition-colors"
                      >
                        {t('factoring.list.action.verify')}
                      </button>
                    )}
                    {inv.status === 'debtor_notified' && (
                      <button
                        type="button"
                        onClick={() => onRecordPayment(inv)}
                        className="text-[color:var(--status-success-text)] hover:opacity-80 transition-colors"
                      >
                        {t('factoring.list.action.recordPayment')}
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}

function shortenId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function DueTimingCell({ dueDate }: { dueDate: string }) {
  const { t } = useI18n();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return (
      <span className="text-[12px] font-medium text-[color:var(--status-warning-text)]">
        {t('factoring.list.dueToday')}
      </span>
    );
  }
  if (diffDays < 0) {
    return (
      <span className="text-[12px] font-medium text-[color:var(--status-error-text)] tabular-nums">
        {t('factoring.list.daysPastDue', { count: Math.abs(diffDays) })}
      </span>
    );
  }
  return (
    <span className="text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
      {t('factoring.list.daysToDue', { count: diffDays })}
    </span>
  );
}
