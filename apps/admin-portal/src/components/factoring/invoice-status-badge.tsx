'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import type { InvoiceStatus } from '@/lib/graphql/factoring';

const palette: Record<InvoiceStatus, string> = {
  submitted:
    'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]',
  under_review:
    'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  verified:
    'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]',
  offer_generated:
    'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]',
  offer_accepted:
    'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
  funded:
    'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
  debtor_notified:
    'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]',
  payment_received:
    'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
  reserve_released:
    'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
  settled:
    'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
  disputed:
    'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  defaulted:
    'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
  cancelled:
    'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]',
  rejected:
    'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
};

const labelKey: Record<InvoiceStatus, string> = {
  submitted: 'factoring.status.submitted',
  under_review: 'factoring.status.underReview',
  verified: 'factoring.status.verified',
  offer_generated: 'factoring.status.offerGenerated',
  offer_accepted: 'factoring.status.offerAccepted',
  funded: 'factoring.status.funded',
  debtor_notified: 'factoring.status.debtorNotified',
  payment_received: 'factoring.status.paymentReceived',
  reserve_released: 'factoring.status.reserveReleased',
  settled: 'factoring.status.settled',
  disputed: 'factoring.status.disputed',
  defaulted: 'factoring.status.defaulted',
  cancelled: 'factoring.status.cancelled',
  rejected: 'factoring.status.rejected',
};

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

/**
 * Color-coded invoice status pill. 14 lifecycle states across the invoice
 * factoring pipeline.
 */
export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
  const { t } = useI18n();
  const colors = palette[status] ??
    'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]';
  const label = labelKey[status] ? t(labelKey[status]) : status;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors}${
        className ? ` ${className}` : ''
      }`}
    >
      {label}
    </span>
  );
}
