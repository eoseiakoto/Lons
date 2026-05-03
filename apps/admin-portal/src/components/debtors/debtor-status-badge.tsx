'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import type { DebtorStatus } from '@/lib/graphql/factoring';

const palette: Record<DebtorStatus, string> = {
  active:
    'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
  under_review:
    'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  suspended:
    'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  blacklisted:
    'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
};

const labelKey: Record<DebtorStatus, string> = {
  active: 'debtors.status.active',
  under_review: 'debtors.status.underReview',
  suspended: 'debtors.status.suspended',
  blacklisted: 'debtors.status.blacklisted',
};

interface DebtorStatusBadgeProps {
  status: DebtorStatus;
  className?: string;
}

/**
 * Color-coded debtor status pill. Mirrors the merchant status pattern but
 * uses the four DebtorStatus enum values.
 */
export function DebtorStatusBadge({ status, className }: DebtorStatusBadgeProps) {
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
