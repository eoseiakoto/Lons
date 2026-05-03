'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Activity,
  Building2,
  X,
} from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Sparkline } from '@/components/ui/sparkline';
import { AreaChart } from '@/components/ui/area-chart';
import { Gauge } from '@/components/ui/gauge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { formatDateTime } from '@/lib/utils';

// ── GraphQL ──────────────────────────────────────────────────────────────

const PLATFORM_SCREENING_STATS = gql`
  query PlatformScreeningStats {
    platformScreeningStats {
      totalScreenings
      pendingReviewCount
      escalatedCount
      matchRate
      recentScreenings {
        id
        tenantId
        customerId
        tenantName
        customerName
        screenedAt
        status
        riskLevel
        provider
        reviewDecision
      }
    }
  }
`;

const PLATFORM_ESCALATED_SCREENINGS = gql`
  query PlatformEscalatedScreenings($first: Int) {
    platformEscalatedScreenings(first: $first) {
      id
      tenantId
      customerId
      tenantName
      customerName
      screenedAt
      status
      riskLevel
      provider
      reviewDecision
      reviewedBy
      reviewedAt
    }
  }
`;

const PLATFORM_SCREENING_DECISION = gql`
  mutation PlatformScreeningDecision(
    $screeningId: ID!
    $decision: String!
    $reason: String
  ) {
    platformScreeningDecision(
      screeningId: $screeningId
      decision: $decision
      reason: $reason
    ) {
      id
      tenantName
      customerName
      reviewDecision
      reviewedAt
    }
  }
`;

// ── Types ────────────────────────────────────────────────────────────────

interface ScreeningEntry {
  id: string;
  tenantId: string;
  customerId: string;
  tenantName?: string;
  customerName?: string;
  screenedAt: string;
  status: string;
  riskLevel: string;
  provider: string;
  reviewDecision?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  LOW: 'var(--status-success)',
  MEDIUM: 'var(--status-warning)',
  HIGH: 'var(--status-warning)',
  CRITICAL: 'var(--status-error)',
};

const STATUS_COLOR: Record<string, string> = {
  CLEAR: 'var(--status-success)',
  MATCH: 'var(--status-error)',
  POTENTIAL_MATCH: 'var(--status-warning)',
  ERROR: 'var(--text-tertiary)',
};

function riskPill(level: string) {
  const color = RISK_COLOR[level] ?? 'var(--text-tertiary)';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: `${color}1A`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {level}
    </span>
  );
}

function statusPill(status: string) {
  const color = STATUS_COLOR[status] ?? 'var(--text-tertiary)';
  const label = status.replace(/_/g, ' ');
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: `${color}1A`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export default function ScreeningPage() {
  const [activeTab, setActiveTab] = useState<'recent' | 'escalated'>('recent');
  const [actionModal, setActionModal] = useState<{
    screening: ScreeningEntry;
    action: string;
  } | null>(null);
  const [reason, setReason] = useState('');

  const {
    data: statsData,
    loading: statsLoading,
    refetch: refetchStats,
  } = useQuery(PLATFORM_SCREENING_STATS);

  const {
    data: escalatedData,
    loading: escalatedLoading,
    refetch: refetchEscalated,
  } = useQuery(PLATFORM_ESCALATED_SCREENINGS, {
    variables: { first: 50 },
  });

  const [submitDecision, { loading: submitting }] = useMutation(
    PLATFORM_SCREENING_DECISION,
    {
      onCompleted: () => {
        setActionModal(null);
        setReason('');
        refetchStats();
        refetchEscalated();
      },
    },
  );

  const stats = statsData?.platformScreeningStats;
  const recentScreenings: ScreeningEntry[] = stats?.recentScreenings ?? [];
  const escalatedScreenings: ScreeningEntry[] = escalatedData?.platformEscalatedScreenings ?? [];

  const breakdown = useMemo(() => {
    const risk: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const status: Record<string, number> = {
      CLEAR: 0,
      POTENTIAL_MATCH: 0,
      MATCH: 0,
      ERROR: 0,
    };
    recentScreenings.forEach((s) => {
      if (s.riskLevel in risk) risk[s.riskLevel] += 1;
      if (s.status in status) status[s.status] += 1;
    });

    // 14-day activity timeline from recentScreenings dates
    const now = new Date();
    const buckets = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    recentScreenings.forEach((s) => {
      const key = new Date(s.screenedAt).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    const timeline = Array.from(buckets.entries()).map(([k, v]) => {
      const d = new Date(`${k}T00:00:00Z`);
      return {
        label: d.toLocaleString('en', { day: 'numeric', month: 'short' }),
        value: v,
      };
    });
    const peakIdx = timeline.reduce(
      (acc, p, i) => (p.value > acc.value ? { value: p.value, idx: i } : acc),
      { value: -Infinity, idx: 0 },
    ).idx;

    return { risk, status, timeline, peakIdx };
  }, [recentScreenings]);

  const sparkData = breakdown.timeline.map((t) => t.value);
  const totalRisk = Object.values(breakdown.risk).reduce((a, b) => a + b, 0) || 1;

  function handleAction(screening: ScreeningEntry, action: string) {
    if (action === 'confirm_block') {
      submitDecision({
        variables: {
          screeningId: screening.id,
          decision: 'BLOCK',
          reason: 'Platform admin confirmed block from escalation',
        },
      });
    } else {
      setActionModal({ screening, action });
    }
  }

  function handleSubmitAction() {
    if (!actionModal) return;
    const decision =
      actionModal.action === 'override_approve' ? 'APPROVE' : 'FLAG_INVESTIGATION';
    submitDecision({
      variables: {
        screeningId: actionModal.screening.id,
        decision,
        reason: reason || undefined,
      },
    });
  }

  const matchRate = stats?.matchRate ?? 0;
  const isLoading = statsLoading;

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      {/* Header */}
      <header className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="live-dot" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
              Live · AML telemetry
            </span>
          </div>
          <h1
            className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
            style={{ fontSize: 44, lineHeight: 1.05 }}
          >
            AML Screening
          </h1>
          <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
            AML and KYC hits across every tenant. Escalate or clear from here.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2 card-glow">
            <Shield className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
            <span className="text-[color:var(--text-secondary)]">Provider</span>
            <span className="text-[color:var(--text-primary)] font-medium">
              {recentScreenings[0]?.provider ?? 'Mock'}
            </span>
          </div>
        </div>
      </header>

      {/* KPI strip — 4 cards with visual elements */}
      <section className="relative z-10 stagger-children grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title="Total Screenings"
          value={isLoading ? '—' : <AnimatedNumber value={stats?.totalScreenings ?? 0} />}
          subtitle="Across all tenants"
          icon={<Activity className="w-4 h-4" />}
          chart={
            sparkData.length > 1 ? (
              <Sparkline
                data={sparkData}
                width={320}
                height={36}
                color="var(--accent-primary)"
                className="w-full h-9 mt-1"
              />
            ) : undefined
          }
        />
        <MetricCard
          variant="glow"
          title="Pending Reviews"
          value={isLoading ? '—' : <AnimatedNumber value={stats?.pendingReviewCount ?? 0} />}
          subtitle="Awaiting tenant action"
          icon={<Clock className="w-4 h-4" />}
          live={(stats?.pendingReviewCount ?? 0) > 0}
        />
        <MetricCard
          variant="glow"
          title="Escalated"
          value={isLoading ? '—' : <AnimatedNumber value={stats?.escalatedCount ?? 0} />}
          subtitle="Awaiting platform decision"
          icon={<ShieldAlert className="w-4 h-4" />}
          live={(stats?.escalatedCount ?? 0) > 0}
        />
        <div className="card-glow card-glow-sweep p-5 flex items-center gap-4 relative">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
              Match Rate
            </p>
            <p
              className="font-semibold tabular-nums leading-none mt-2"
              style={{
                fontSize: 36,
                letterSpacing: '-0.025em',
                color: 'var(--accent-primary-deep)',
                textShadow: '0 0 24px rgba(var(--accent-primary-rgb), 0.30)',
              }}
            >
              {matchRate.toFixed(1)}%
            </p>
            <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">
              MATCH + POTENTIAL_MATCH / total
            </p>
          </div>
          <Gauge value={matchRate} size={90} />
        </div>
      </section>

      {/* Distribution row — risk breakdown + screening status */}
      <section className="relative z-10 grid grid-cols-12 gap-4">
        {/* Activity timeline */}
        <div className="col-span-12 lg:col-span-8 card-glow p-6 lg:p-7">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">
                Screening volume
              </p>
              <p className="text-[22px] font-semibold tracking-tight text-[color:var(--text-primary)] mt-1">
                Last 14 days
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                Sample
              </p>
              <p className="text-[22px] font-semibold tabular-nums text-[color:var(--accent-primary-deep)] mt-1">
                {recentScreenings.length}
              </p>
            </div>
          </div>
          <div className="-mx-2">
            <AreaChart
              data={breakdown.timeline}
              height={200}
              pinIndex={breakdown.peakIdx}
              pinLabel={`peak · ${breakdown.timeline[breakdown.peakIdx]?.label ?? ''}`}
              color="var(--accent-primary)"
            />
          </div>
        </div>

        {/* Risk distribution */}
        <div className="col-span-12 lg:col-span-4 card-glow p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              Risk distribution
            </h2>
            <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
              {totalRisk} sampled
            </span>
          </div>
          <div className="space-y-3.5">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((level) => {
              const count = breakdown.risk[level];
              const pct = (count / totalRisk) * 100;
              const color = RISK_COLOR[level];
              return (
                <div key={level} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px]">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: color,
                          boxShadow: `0 0 6px ${color}`,
                        }}
                      />
                      <span className="text-[color:var(--text-primary)] font-medium">{level}</span>
                    </span>
                    <span className="text-[12px] tabular-nums">
                      <span className="text-[color:var(--text-primary)] font-semibold">{count}</span>
                      <span className="text-[color:var(--text-tertiary)] ml-1.5">
                        {pct.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  <ProgressBar
                    value={pct}
                    max={100}
                    size="sm"
                    variant={
                      level === 'CRITICAL'
                        ? 'error'
                        : level === 'HIGH' || level === 'MEDIUM'
                          ? 'warning'
                          : 'success'
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tab nav + table */}
      <section className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex p-1 rounded-lg card-glow gap-1" style={{ padding: 4 }}>
            <TabButton
              active={activeTab === 'recent'}
              onClick={() => setActiveTab('recent')}
            >
              Recent screenings
            </TabButton>
            <TabButton
              active={activeTab === 'escalated'}
              onClick={() => setActiveTab('escalated')}
              badge={stats?.escalatedCount}
            >
              Escalated
            </TabButton>
          </div>
        </div>

        {activeTab === 'recent' && (
          <ScreeningTable
            data={recentScreenings}
            loading={isLoading}
            emptyMessage="No screening results yet."
          />
        )}

        {activeTab === 'escalated' && (
          <EscalatedTable
            data={escalatedScreenings}
            loading={escalatedLoading}
            onAction={handleAction}
          />
        )}
      </section>

      {/* Action modal */}
      <AnimatePresence>
        {actionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setActionModal(null);
              setReason('');
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="card-glow p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-[18px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                    {actionModal.action === 'override_approve'
                      ? 'Override to approve'
                      : 'Flag for investigation'}
                  </h4>
                  <p className="text-[12px] text-[color:var(--text-tertiary)] mt-1">
                    Screening{' '}
                    <span className="font-mono text-[color:var(--text-secondary)]">
                      {actionModal.screening.id.slice(0, 12)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActionModal(null);
                    setReason('');
                  }}
                  className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <label className="block text-[12px] text-[color:var(--text-secondary)] mb-1.5">
                Reason{' '}
                {actionModal.action === 'override_approve' && (
                  <span className="text-[color:var(--status-error-text)]">*</span>
                )}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  actionModal.action === 'override_approve'
                    ? 'Justify the override decision…'
                    : 'Describe what should be investigated externally…'
                }
                className="w-full h-24 px-3 py-2 rounded-lg text-sm resize-none focus:outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--bg-muted)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />

              <div className="flex gap-2 mt-4 justify-end">
                <button
                  onClick={() => {
                    setActionModal(null);
                    setReason('');
                  }}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitAction}
                  disabled={
                    submitting ||
                    (actionModal.action === 'override_approve' && !reason.trim())
                  }
                  className="btn-primary"
                >
                  {submitting ? 'Submitting…' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="relative px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-2"
      style={{
        color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
      }}
    >
      {active && (
        <motion.span
          layoutId="screening-tab-indicator"
          className="absolute inset-0 rounded-md"
          style={{
            backgroundColor: 'var(--accent-primary)',
            boxShadow: '0 4px 16px -4px rgba(var(--accent-primary-rgb), 0.45)',
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
      {badge != null && badge > 0 && (
        <span
          className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold tabular-nums"
          style={{
            backgroundColor: active
              ? 'rgba(5, 20, 16, 0.20)'
              : 'var(--status-error-soft)',
            color: active ? 'var(--text-on-accent)' : 'var(--status-error-text)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ScreeningTable({
  data,
  loading,
  emptyMessage,
}: {
  data: ScreeningEntry[];
  loading?: boolean;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">
        Loading screening data…
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="card-glow p-12 text-center">
        <Shield className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
        <p className="text-sm text-[color:var(--text-secondary)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="card-glow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border-subtle)]">
              <Th>Tenant</Th>
              <Th>Customer</Th>
              <Th>Screened</Th>
              <Th>Status</Th>
              <Th>Risk</Th>
              <Th>Provider</Th>
              <Th>Decision</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr
                key={r.id}
                className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <Td>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] flex-shrink-0" />
                    <span className="text-[color:var(--text-primary)]">
                      {r.tenantName || r.tenantId.slice(0, 8) + '…'}
                    </span>
                  </div>
                </Td>
                <Td>
                  <span className="text-[color:var(--text-primary)]">
                    {r.customerName || r.customerId.slice(0, 8) + '…'}
                  </span>
                </Td>
                <Td>
                  <span className="text-[color:var(--text-secondary)] text-[12px] tabular-nums">
                    {formatDateTime(r.screenedAt)}
                  </span>
                </Td>
                <Td>{statusPill(r.status)}</Td>
                <Td>{riskPill(r.riskLevel)}</Td>
                <Td>
                  <span className="text-[color:var(--text-secondary)] capitalize">
                    {r.provider}
                  </span>
                </Td>
                <Td>
                  <span className="text-[color:var(--text-secondary)]">
                    {r.reviewDecision || '—'}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EscalatedTable({
  data,
  loading,
  onAction,
}: {
  data: ScreeningEntry[];
  loading?: boolean;
  onAction: (s: ScreeningEntry, action: string) => void;
}) {
  if (loading) {
    return (
      <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">
        Loading escalated cases…
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="card-glow p-12 text-center">
        <ShieldCheck className="w-8 h-8 mx-auto text-[color:var(--accent-primary-deep)] mb-3" />
        <p className="text-sm text-[color:var(--text-primary)] font-medium">All clear.</p>
        <p className="text-[12px] text-[color:var(--text-tertiary)] mt-1">
          No escalated cases waiting on platform review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[color:var(--text-tertiary)] -mt-1">
        Decisions taken here apply cross-tenant.
      </p>
      <div className="card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>Tenant</Th>
                <Th>Customer</Th>
                <Th>Date</Th>
                <Th>Risk</Th>
                <Th>Provider</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr
                  key={r.id}
                  className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <Td>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] flex-shrink-0" />
                      <span className="text-[color:var(--text-primary)]">
                        {r.tenantName || r.tenantId.slice(0, 8) + '…'}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-[color:var(--text-primary)]">
                      {r.customerName || r.customerId.slice(0, 8) + '…'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[12px] text-[color:var(--text-secondary)] tabular-nums">
                      {formatDateTime(r.screenedAt)}
                    </span>
                  </Td>
                  <Td>{riskPill(r.riskLevel)}</Td>
                  <Td>
                    <span className="text-[color:var(--text-secondary)] capitalize">
                      {r.provider}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <ActionButton
                        onClick={() => onAction(r, 'confirm_block')}
                        tone="error"
                      >
                        Block
                      </ActionButton>
                      <ActionButton
                        onClick={() => onAction(r, 'override_approve')}
                        tone="success"
                      >
                        Override
                      </ActionButton>
                      <ActionButton
                        onClick={() => onAction(r, 'flag_investigation')}
                        tone="warning"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Flag
                      </ActionButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}

function ActionButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'success' | 'error' | 'warning';
}) {
  const colorVar = `var(--status-${tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'warning'})`;
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        backgroundColor: `${colorVar}1A`,
        color: colorVar,
        border: `1px solid ${colorVar}33`,
      }}
    >
      {children}
    </button>
  );
}
