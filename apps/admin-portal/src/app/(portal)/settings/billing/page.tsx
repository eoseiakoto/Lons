'use client';

/**
 * Sprint 18 (S18-11) — Billing & Plan tier dashboard.
 *
 * Four sections:
 *   1. Current plan summary (badge, billing model, monthly amount).
 *   2. Usage meters grid (current / limit per dimension, colour-coded
 *      thresholds).
 *   3. Billing invoice history (reuses BillingResolver queries).
 *   4. Feature flags summary.
 *
 * Plus two modals: Compare Plans and Request Upgrade.
 */

import { useState } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import { CreditCard, TrendingUp, CheckCircle2, MinusCircle, ArrowUp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/ui/toast';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { SlideOver } from '@/components/ui/slide-over';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils';

// ── GraphQL ──────────────────────────────────────────────────────────

const PLAN_TIER_SUMMARY = gql`
  query PlanTierSummary {
    planTierSummary {
      currentTier
      tierDisplayName
      billingModel
      subscriptionAmount
      billingCurrency
      contractStartDate
      contractEndDate
      usage {
        activeProducts
        totalCustomers
        monthlyDisbursementVolumeUsd
        monthlyTransactions
        activeLenderConfigs
        activeBnplMerchants
        portalUsers
        activeApiKeys
      }
      limits {
        maxActiveProducts
        maxCustomers
        maxMonthlyDisbursementVolumeUsd
        maxMonthlyTransactions
        maxLenderConfigs
        maxBnplMerchants
        maxPortalUsers
        maxApiKeys
        apiRateLimitPerMinute
      }
      featureFlags
    }
  }
`;

const PLAN_TIER_COMPARISON = gql`
  query PlanTierComparison {
    planTierComparison {
      tier
      displayName
      maxActiveProducts
      maxCustomers
      maxMonthlyDisbursementVolumeUsd
      maxMonthlyTransactions
      maxLenderConfigs
      maxPortalUsers
      apiRateLimitPerMinute
      restApiEnabled
      websocketEnabled
      bulkOperationsEnabled
      featureFlags
    }
  }
`;

const BILLING_INVOICES = gql`
  query BillingInvoices($first: Int) {
    billingInvoices(first: $first) {
      edges {
        node {
          id
          type
          status
          billingPeriodStart
          billingPeriodEnd
          totalAmount
          currency
          dueDate
          createdAt
        }
      }
      pageInfo {
        hasNextPage
      }
      totalCount
    }
  }
`;

const REQUEST_UPGRADE = gql`
  mutation RequestPlanUpgrade($targetTier: String!, $reason: String, $idempotencyKey: String) {
    requestPlanUpgrade(targetTier: $targetTier, reason: $reason, idempotencyKey: $idempotencyKey) {
      id
      status
      requestedTier
      createdAt
    }
  }
`;

// ── Types ────────────────────────────────────────────────────────────

interface PlanTierSummary {
  currentTier: string;
  tierDisplayName: string;
  billingModel: string;
  subscriptionAmount: string;
  billingCurrency: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  usage: {
    activeProducts: number;
    totalCustomers: number;
    monthlyDisbursementVolumeUsd: string;
    monthlyTransactions: number;
    activeLenderConfigs: number;
    activeBnplMerchants: number;
    portalUsers: number;
    activeApiKeys: number;
  };
  limits: {
    maxActiveProducts: number | null;
    maxCustomers: number | null;
    maxMonthlyDisbursementVolumeUsd: string | null;
    maxMonthlyTransactions: number | null;
    maxLenderConfigs: number | null;
    maxBnplMerchants: number | null;
    maxPortalUsers: number | null;
    maxApiKeys: number | null;
    apiRateLimitPerMinute: number;
  };
  featureFlags: Record<string, unknown>;
}

// ── Page ─────────────────────────────────────────────────────────────

export default function BillingPlanPage() {
  const { t } = useI18n();
  const { toast } = useToast();

  const { data, loading } = useQuery(PLAN_TIER_SUMMARY, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: invoiceData } = useQuery(BILLING_INVOICES, {
    variables: { first: 20 },
  });

  const [showCompare, setShowCompare] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const summary: PlanTierSummary | undefined = data?.planTierSummary;
  const invoices = invoiceData?.billingInvoices?.edges?.map((e: { node: any }) => e.node) ?? [];

  if (loading && !summary) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <p className="text-[color:var(--text-tertiary)]">{t('common.loading')}</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <p className="text-[color:var(--text-tertiary)]">
          {t('billing.notAvailable') || 'Billing data not available'}
        </p>
      </div>
    );
  }

  const isEnterprise = summary.currentTier === 'enterprise';
  const tierColors: Record<string, string> = {
    starter: 'var(--status-info)',
    growth: 'var(--accent-primary)',
    enterprise: 'var(--status-success)',
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.subscription') || 'Subscription'}
        title={t('billing.title') || 'Billing & Plan'}
        subtitle={t('billing.subtitle') || 'Your current plan, usage, and billing history'}
      />

      {/* Section 1: Plan summary */}
      <section className="relative z-10 card-glow p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
              }}
            >
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <span
                className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-2 text-white"
                style={{ backgroundColor: tierColors[summary.currentTier] || 'var(--accent-primary)' }}
              >
                {summary.tierDisplayName}
              </span>
              <h2 className="text-[20px] font-semibold text-[color:var(--text-primary)]">
                {formatMoney(summary.subscriptionAmount, summary.billingCurrency)} / month
              </h2>
              <p className="text-[13px] text-[color:var(--text-tertiary)] mt-1">
                {summary.billingModel.replace(/_/g, ' ')}
                {' · '}
                {summary.contractStartDate
                  ? `${formatDate(summary.contractStartDate)}${
                      summary.contractEndDate ? ` — ${formatDate(summary.contractEndDate)}` : ' — month-to-month'
                    }`
                  : t('billing.monthToMonth') || 'month-to-month'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCompare(true)}
              className="px-3 py-2 rounded-lg text-[13px] font-medium"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
              }}
            >
              {t('billing.comparePlans') || 'Compare plans'}
            </button>
            {!isEnterprise && (
              <button
                type="button"
                onClick={() => setShowUpgrade(true)}
                className="px-3 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-on-accent)' }}
              >
                <ArrowUp className="w-3.5 h-3.5" />
                {t('billing.requestUpgrade') || 'Request upgrade'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Usage meters */}
      <section className="relative z-10 space-y-3">
        <h2 className="section-label">{t('billing.usage.title') || 'Usage this period'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <UsageMeter
            label="Active products"
            current={summary.usage.activeProducts}
            limit={summary.limits.maxActiveProducts}
          />
          <UsageMeter
            label="Total customers"
            current={summary.usage.totalCustomers}
            limit={summary.limits.maxCustomers}
          />
          <UsageMeter
            label="Disbursement vol (USD)"
            currency={summary.billingCurrency}
            money
            current={summary.usage.monthlyDisbursementVolumeUsd}
            limit={summary.limits.maxMonthlyDisbursementVolumeUsd}
          />
          <UsageMeter
            label="Monthly transactions"
            current={summary.usage.monthlyTransactions}
            limit={summary.limits.maxMonthlyTransactions}
          />
          <UsageMeter
            label="Lender configs"
            current={summary.usage.activeLenderConfigs}
            limit={summary.limits.maxLenderConfigs}
          />
          <UsageMeter
            label="Portal users"
            current={summary.usage.portalUsers}
            limit={summary.limits.maxPortalUsers}
          />
          <UsageMeter
            label="API keys"
            current={summary.usage.activeApiKeys}
            limit={summary.limits.maxApiKeys}
          />
          <InfoMeter label="API rate limit" value={`${summary.limits.apiRateLimitPerMinute} req/min`} />
        </div>
      </section>

      {/* Section 3: Billing history */}
      <section className="relative z-10 space-y-3">
        <h2 className="section-label">{t('billing.history.title') || 'Billing history'}</h2>
        <div className="card-glow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border-subtle)]">
                  <Th>Period</Th>
                  <Th>Type</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                  <Th>Due</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-[color:var(--text-tertiary)]">
                      {t('billing.history.empty') || 'No invoices yet'}
                    </td>
                  </tr>
                ) : (
                  invoices.map((i: any) => (
                    <tr
                      key={i.id}
                      className="border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)]"
                    >
                      <Td>
                        <span className="tabular-nums">
                          {formatDate(i.billingPeriodStart)} – {formatDate(i.billingPeriodEnd)}
                        </span>
                      </Td>
                      <Td>
                        <span className="capitalize">{i.type.replace(/_/g, ' ')}</span>
                      </Td>
                      <Td>
                        <span className="tabular-nums font-semibold">
                          {formatMoney(i.totalAmount, i.currency)}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={i.status} />
                      </Td>
                      <Td>
                        <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                          {i.dueDate ? formatDate(i.dueDate) : '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                          {formatDateTime(i.createdAt)}
                        </span>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 4: Feature flags */}
      <section className="relative z-10 card-glow p-6">
        <h2 className="section-label mb-3">{t('billing.features.title') || 'Plan features'}</h2>
        <FeatureFlagGrid flags={summary.featureFlags} />
      </section>

      {showCompare && (
        <ComparePlansPanel
          currentTier={summary.currentTier}
          onClose={() => setShowCompare(false)}
          onUpgrade={() => {
            setShowCompare(false);
            setShowUpgrade(true);
          }}
        />
      )}
      {showUpgrade && (
        <UpgradePanel
          currentTier={summary.currentTier}
          onClose={() => setShowUpgrade(false)}
          onSuccess={() => {
            toast('success', t('billing.upgrade.submitted') || 'Upgrade request submitted');
            setShowUpgrade(false);
          }}
        />
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}

function UsageMeter({
  label,
  current,
  limit,
  money,
  currency,
}: {
  label: string;
  current: number | string;
  limit: number | string | null;
  money?: boolean;
  currency?: string;
}) {
  const currentNum = typeof current === 'number' ? current : parseFloat(current);
  const limitNum = limit == null ? null : typeof limit === 'number' ? limit : parseFloat(limit);
  const pct = limitNum != null && limitNum > 0 ? Math.min(100, (currentNum / limitNum) * 100) : 0;
  const colour =
    limitNum == null
      ? 'var(--text-tertiary)'
      : pct >= 90
        ? 'var(--status-error)'
        : pct >= 70
          ? 'var(--status-warning)'
          : 'var(--status-success)';

  const display = money && currency
    ? `${currency} ${currentNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : currentNum.toLocaleString();

  const limitDisplay =
    limit == null
      ? '∞'
      : money && currency
        ? `${currency} ${limitNum?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : limitNum?.toLocaleString();

  return (
    <div className="card-glow p-4">
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">
        {label}
      </p>
      <p className="text-[16px] font-semibold tabular-nums text-[color:var(--text-primary)]">
        {display}{' '}
        <span className="text-[13px] font-normal text-[color:var(--text-tertiary)]">
          / {limitDisplay}
        </span>
      </p>
      {limit != null ? (
        <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden bg-[color:var(--bg-muted)]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: colour }}
          />
        </div>
      ) : (
        <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">Unlimited</p>
      )}
    </div>
  );
}

function InfoMeter({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-glow p-4">
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">
        {label}
      </p>
      <p className="text-[16px] font-semibold tabular-nums text-[color:var(--text-primary)]">
        {value}
      </p>
      <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">
        <TrendingUp className="w-3 h-3 inline mr-1" />
        Tier limit
      </p>
    </div>
  );
}

function FeatureFlagGrid({ flags }: { flags: Record<string, unknown> }) {
  const entries = Object.entries(flags);
  if (entries.length === 0) {
    return <p className="text-sm text-[color:var(--text-tertiary)]">No feature flags defined.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {entries.map(([key, value]) => (
        <FeatureFlagItem key={key} flag={key} value={value} />
      ))}
    </div>
  );
}

function FeatureFlagItem({ flag, value }: { flag: string; value: unknown }) {
  const label = flag
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  const isOn = value === true || (typeof value === 'string' && value !== 'none' && value !== '');
  const display = typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : String(value);

  return (
    <div className="flex items-center gap-2 text-sm">
      {isOn ? (
        <CheckCircle2 className="w-4 h-4 text-[color:var(--status-success)] flex-shrink-0" />
      ) : (
        <MinusCircle className="w-4 h-4 text-[color:var(--text-tertiary)] flex-shrink-0" />
      )}
      <span className="text-[color:var(--text-secondary)] flex-1">{label}</span>
      <span
        className="text-[12px] font-medium"
        style={{ color: isOn ? 'var(--status-success-text)' : 'var(--text-tertiary)' }}
      >
        {display}
      </span>
    </div>
  );
}

function ComparePlansPanel({
  currentTier,
  onClose,
  onUpgrade,
}: {
  currentTier: string;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const { data } = useQuery(PLAN_TIER_COMPARISON);
  const tiers = data?.planTierComparison ?? [];
  return (
    <SlideOver title="Compare plans" onClose={onClose} width={720}>
      <div className="space-y-3 text-sm">
        {tiers.map((t: any) => (
          <div
            key={t.tier}
            className="p-4 rounded-lg"
            style={{
              border: `1px solid ${currentTier === t.tier ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              backgroundColor:
                currentTier === t.tier ? 'var(--accent-primary-soft)' : 'transparent',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-semibold text-[color:var(--text-primary)]">
                {t.displayName}
              </h3>
              {currentTier === t.tier && (
                <span className="text-[11px] uppercase tracking-wider text-[color:var(--accent-primary-deep)] font-semibold">
                  Current
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              <Row k="Max products" v={t.maxActiveProducts ?? 'Unlimited'} />
              <Row k="Max customers" v={t.maxCustomers ?? 'Unlimited'} />
              <Row k="Monthly volume" v={t.maxMonthlyDisbursementVolumeUsd ?? 'Unlimited'} />
              <Row k="Monthly txns" v={t.maxMonthlyTransactions ?? 'Unlimited'} />
              <Row k="Lender configs" v={t.maxLenderConfigs ?? 'Unlimited'} />
              <Row k="Portal users" v={t.maxPortalUsers ?? 'Unlimited'} />
              <Row k="Rate limit" v={`${t.apiRateLimitPerMinute} req/min`} />
              <Row k="REST API" v={t.restApiEnabled ? 'Yes' : 'No'} />
              <Row k="WebSocket" v={t.websocketEnabled ? 'Yes' : 'No'} />
              <Row k="Bulk ops" v={t.bulkOperationsEnabled ? 'Yes' : 'No'} />
            </dl>
          </div>
        ))}
        {currentTier !== 'enterprise' && (
          <button
            type="button"
            onClick={onUpgrade}
            className="w-full px-3 py-2 rounded-lg text-[13px] font-medium"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-on-accent)' }}
          >
            Request upgrade
          </button>
        )}
      </div>
    </SlideOver>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-[color:var(--text-tertiary)]">{k}</dt>
      <dd className="text-[color:var(--text-primary)] text-right tabular-nums">{v}</dd>
    </>
  );
}

function UpgradePanel({
  currentTier,
  onClose,
  onSuccess,
}: {
  currentTier: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const tierOrder = ['starter', 'growth', 'enterprise'];
  const availableTiers = tierOrder.slice(tierOrder.indexOf(currentTier) + 1);
  const [target, setTarget] = useState(availableTiers[0] ?? '');
  const [reason, setReason] = useState('');
  const [requestUpgrade, { loading }] = useMutation(REQUEST_UPGRADE);

  const handleSubmit = async () => {
    try {
      await requestUpgrade({
        variables: {
          targetTier: target,
          reason: reason || undefined,
          idempotencyKey: `upgrade:${target}:${Date.now()}`,
        },
      });
      onSuccess();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <SlideOver title="Request plan upgrade" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <Field label="Target tier">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="ut-input"
          >
            {availableTiers.map((tt) => (
              <option key={tt} value={tt}>
                {tt[0].toUpperCase() + tt.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why are you upgrading? (optional)">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="ut-input min-h-[100px]"
            placeholder="Help us understand your needs"
          />
        </Field>
        <p className="text-[12px] text-[color:var(--text-tertiary)]">
          Our team will review your request within 2 business days.
        </p>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={loading} className="ut-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !target}
            className="ut-btn-primary flex-1"
          >
            {loading ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
      <style jsx global>{`
        .ut-input {
          width: 100%;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-primary);
          padding: 8px 12px;
          font-size: 14px;
        }
        .ut-btn-primary {
          background: var(--accent-primary);
          color: var(--text-on-accent);
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }
        .ut-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ut-btn-secondary {
          background: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }
      `}</style>
    </SlideOver>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[color:var(--text-secondary)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
