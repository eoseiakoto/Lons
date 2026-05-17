'use client';

/**
 * S17-9 / FR-CM-002.1 — Customer financial profile tab.
 *
 * Pre-S17 this tab was a placeholder. It now consumes
 * `customerFinancialProfile` from the GraphQL API and renders the
 * aggregated view: total loans, active contracts, repayment score,
 * default rate, average loan size, outstanding balance, plus the
 * latest EMI snapshot (wallet balance / 30-day averages / transaction
 * count / income consistency).
 *
 * The aggregation is cache-backed server-side (15-minute TTL); the
 * UI just renders whatever comes back.
 */

import { BarChart3 } from 'lucide-react';
import { gql, useQuery } from '@apollo/client';

import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/utils';

const FINANCIAL_PROFILE_QUERY = gql`
  query CustomerFinancialProfile($customerId: ID!) {
    customerFinancialProfile(customerId: $customerId) {
      customerId
      totalLoans
      activeContracts
      repaymentScore
      averageLoanSize
      defaultRate
      defaultedContracts
      totalOutstandingBalance
      latestWalletBalance
      averageBalance30d
      transactionCount30d
      incomeConsistency
      lastUpdated
    }
  }
`;

interface TabFinancialProfileProps {
  customer: any;
  customerId?: string;
}

export function TabFinancialProfile({
  customer,
  customerId,
}: TabFinancialProfileProps) {
  const { t } = useI18n();
  const currency = customer?.currency || 'GHS';
  const id = customerId || customer?.id;

  const { data, loading, error } = useQuery(FINANCIAL_PROFILE_QUERY, {
    variables: { customerId: id },
    skip: !id,
  });

  const profile = data?.customerFinancialProfile;

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading && !profile) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center py-16 text-[color:var(--text-tertiary)]">
          <p className="text-sm">{t('common.loading') || 'Loading…'}</p>
        </div>
      </div>
    );
  }

  // ── Error / empty fallback (preserves the legacy placeholder look) ────
  if (error || !profile) {
    return (
      <div className="card p-6">
        <h3 className="section-label mb-6">
          {t('customers.financialProfile.transactionPatternSummary')}
        </h3>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[color:var(--bg-muted)] flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-[color:var(--text-tertiary)]" />
          </div>
          <h4 className="text-lg font-medium text-[color:var(--text-tertiary)]">
            {t('customers.financialProfile.comingSoon')}
          </h4>
          <p className="text-sm text-[color:var(--text-tertiary)] mt-2 max-w-md">
            {t('customers.financialProfile.comingSoonDescription')}
          </p>
        </div>
      </div>
    );
  }

  // ── Loaded state ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Loan portfolio summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Loans"
          value={String(profile.totalLoans)}
        />
        <MetricCard
          label="Active Contracts"
          value={String(profile.activeContracts)}
        />
        <MetricCard
          label="Repayment Score"
          value={
            profile.repaymentScore == null
              ? '--'
              : `${profile.repaymentScore}%`
          }
        />
        <MetricCard
          label="Default Rate"
          value={`${profile.defaultRate}%`}
          tone={profile.defaultRate >= 20 ? 'error' : undefined}
        />
      </div>

      {/* Balance row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          label="Average Loan Size"
          value={formatMoney(profile.averageLoanSize, currency)}
        />
        <MetricCard
          label="Total Outstanding"
          value={formatMoney(profile.totalOutstandingBalance, currency)}
        />
      </div>

      {/* EMI / wallet snapshot — null when no integration data exists */}
      <div className="card p-6">
        <h3 className="section-label mb-4">
          {t('customers.financialProfile.transactionPatternSummary')}
        </h3>
        {profile.latestWalletBalance == null &&
        profile.averageBalance30d == null &&
        profile.transactionCount30d == null ? (
          <p className="text-sm text-[color:var(--text-tertiary)]">
            {t('customers.financialProfile.comingSoonDescription')}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label={t('customers.financialProfile.walletActivity')}
              value={
                profile.transactionCount30d != null
                  ? String(profile.transactionCount30d)
                  : '--'
              }
              sublabel="last 30 days"
            />
            <MetricCard
              label="Current Balance"
              value={
                profile.latestWalletBalance != null
                  ? formatMoney(profile.latestWalletBalance, currency)
                  : '--'
              }
            />
            <MetricCard
              label="Avg Balance (30d)"
              value={
                profile.averageBalance30d != null
                  ? formatMoney(profile.averageBalance30d, currency)
                  : '--'
              }
            />
            <MetricCard
              label="Income Consistency"
              value={
                profile.incomeConsistency != null
                  ? `${profile.incomeConsistency}/100`
                  : '--'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small presentational card — kept inline to avoid hauling in a
 * new shared component just for two callsites.
 */
function MetricCard({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'error' | 'success';
}) {
  const toneClass =
    tone === 'error'
      ? 'text-[color:var(--status-error-text)]'
      : tone === 'success'
        ? 'text-[color:var(--status-success-text)]'
        : '';
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-[color:var(--text-tertiary)] uppercase">
        {label}
      </p>
      <p className={`text-lg font-bold mt-1 ${toneClass}`}>{value}</p>
      {sublabel ? (
        <p className="text-[10px] text-[color:var(--text-tertiary)] mt-1 uppercase tracking-wide">
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}
