'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { bankersRound, compare } from '@/lib/decimal';

interface DebtorRiskBadgeProps {
  /** Decimal-as-string in [0, 100]. Higher score = lower risk. */
  score?: string | null;
  className?: string;
}

/**
 * Color-coded risk score pill. Threshold convention from the spec:
 *  - score >= 80 → low risk (green)
 *  - 50 <= score < 80 → medium risk (amber)
 *  - score < 50 → high risk (red)
 *
 * Decimal-string compare — never `Number(score)`.
 */
export function DebtorRiskBadge({ score, className }: DebtorRiskBadgeProps) {
  const { t } = useI18n();

  if (score == null || score === '') {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]${
          className ? ` ${className}` : ''
        }`}
      >
        {t('debtors.risk.notAvailable')}
      </span>
    );
  }

  const isLow = compare(score, '80') >= 0;
  const isMedium = !isLow && compare(score, '50') >= 0;

  const colors = isLow
    ? 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]'
    : isMedium
      ? 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]'
      : 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]';

  const tierLabel = isLow
    ? t('debtors.risk.tierLow')
    : isMedium
      ? t('debtors.risk.tierMedium')
      : t('debtors.risk.tierHigh');

  // Display whole-number score (banker-round to 0 dp).
  const displayScore = bankersRound(score, 0);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border tabular-nums ${colors}${
        className ? ` ${className}` : ''
      }`}
      title={t('debtors.risk.tooltip', { score: displayScore, tier: tierLabel })}
    >
      <span className="font-semibold">{displayScore}</span>
      <span className="opacity-80">·</span>
      <span>{tierLabel}</span>
    </span>
  );
}
