'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gql, useQuery, useLazyQuery, useMutation } from '@apollo/client';
import {
  ClipboardList,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';

// ---------------------------------------------------------------------------
// GraphQL Queries
// ---------------------------------------------------------------------------

const LOAN_REQUESTS_QUERY = gql`
  query LoanRequests($pagination: PaginationInput, $status: String) {
    loanRequests(pagination: $pagination, status: $status) {
      edges {
        node {
          id
          customerId
          productId
          requestedAmount
          currency
          status
          channel
          createdAt
          customer {
            id
            fullName
          }
          product {
            id
            name
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const CUSTOMER_SCREENING_QUERY = gql`
  query CustomerScreenings($customerId: ID!, $first: Int) {
    customerScreenings(customerId: $customerId, first: $first) {
      screeningId
      status
      riskLevel
      screenedAt
    }
  }
`;

const CUSTOMER_EXPOSURE_QUERY = gql`
  query CustomerExposure($customerId: ID!) {
    customerExposure(customerId: $customerId) {
      totalExposure
      maxAllowed
      utilizationPercent
    }
  }
`;

// P1-012: manual approve/reject for requests stuck in `manual_review`.
const APPROVE_LOAN_MANUAL = gql`
  mutation ApproveLoanManual(
    $loanRequestId: ID!
    $decision: ApprovalDecision!
    $idempotencyKey: String!
    $reasonCode: String
    $reasonDetail: String
    $adjustedAmount: String
    $approvedTenor: Float
  ) {
    approveLoanManual(
      loanRequestId: $loanRequestId
      decision: $decision
      idempotencyKey: $idempotencyKey
      reasonCode: $reasonCode
      reasonDetail: $reasonDetail
      adjustedAmount: $adjustedAmount
      approvedTenor: $approvedTenor
    ) {
      id
      status
      approvedAmount
    }
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoanRequest {
  id: string;
  customerId: string;
  productId: string;
  requestedAmount: string;
  currency: string;
  status: string;
  channel: string;
  createdAt: string;
  customer?: { id: string; fullName: string } | null;
  product?: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Inline Badges
// ---------------------------------------------------------------------------

function AmlBadge({ status }: { status: string | null }) {
  const { t } = useI18n();
  if (!status) {
    return (
      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full border bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]">
        {t('loans.applications.aml.na')}
      </span>
    );
  }
  const styles: Record<string, string> = {
    CLEAR: 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
    POTENTIAL_MATCH: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
    MATCH: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
  };
  const label: Record<string, string> = {
    CLEAR: t('loans.applications.aml.clear'),
    POTENTIAL_MATCH: t('loans.applications.aml.potentialMatch'),
    MATCH: t('loans.applications.aml.match'),
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${styles[status] ?? 'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]'}`}>
      {label[status] ?? `${t('loans.applications.aml.prefix')}${status}`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail Drawer
// ---------------------------------------------------------------------------

function ApplicationDetailDrawer({
  request,
  onClose,
  onChanged,
}: {
  request: LoanRequest;
  onClose: () => void;
  /** Called after a successful approve/reject so the parent can refetch the queue. */
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [loadScreening, { data: screeningData, loading: screeningLoading }] =
    useLazyQuery(CUSTOMER_SCREENING_QUERY, { fetchPolicy: 'cache-and-network' });
  const [loadExposure, { data: exposureData, loading: exposureLoading }] =
    useLazyQuery(CUSTOMER_EXPOSURE_QUERY, { fetchPolicy: 'cache-and-network' });

  // P1-012: manual approve/reject. Operators can adjust amount/tenor on
  // approval, or supply a `reasonCode` on reject. The idempotency key stops
  // double-clicks from double-approving.
  const [approveLoan, { loading: approving }] = useMutation(APPROVE_LOAN_MANUAL);
  const [adjustedAmount, setAdjustedAmount] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const isManualReview = request.status === 'manual_review';

  const handleApprove = async () => {
    setActionError(null);
    try {
      await approveLoan({
        variables: {
          loanRequestId: request.id,
          decision: 'APPROVE',
          idempotencyKey: `manual-approve-${request.id}-${Date.now()}`,
          adjustedAmount: adjustedAmount.trim() || null,
        },
      });
      onChanged?.();
      onClose();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t('loans.applications.error.approvalFailed'));
    }
  };

  const handleReject = async () => {
    setActionError(null);
    if (!rejectReason.trim()) {
      setActionError(t('loans.applications.error.rejectReasonRequired'));
      return;
    }
    try {
      await approveLoan({
        variables: {
          loanRequestId: request.id,
          decision: 'REJECT',
          idempotencyKey: `manual-reject-${request.id}-${Date.now()}`,
          reasonCode: 'OPERATOR_REJECTION',
          reasonDetail: rejectReason.trim(),
        },
      });
      onChanged?.();
      onClose();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t('loans.applications.error.rejectionFailed'));
    }
  };

  // Fire both on mount
  useState(() => {
    loadScreening({ variables: { customerId: request.customerId, first: 1 } });
    loadExposure({ variables: { customerId: request.customerId } });
  });

  const screening = screeningData?.customerScreenings?.[0] ?? null;
  const exposure = exposureData?.customerExposure ?? null;

  const utilizationPercent = exposure?.utilizationPercent ?? null;
  const exposureColor =
    utilizationPercent === null
      ? 'text-[color:var(--text-tertiary)]'
      : utilizationPercent < 60
        ? 'text-[color:var(--status-success-text)]'
        : utilizationPercent < 80
          ? 'text-[color:var(--status-warning-text)]'
          : 'text-[color:var(--status-error-text)]';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      {/* drawer panel */}
      <div
        className="relative w-full max-w-lg card border-l border-[color:var(--border-subtle)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">{t('loans.applications.detail.title')}</h2>
            <button
              onClick={onClose}
              className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Basic Info */}
          <div className="card p-4 space-y-3">
            <h3 className="section-label">{t('loans.applications.detail.requestInfo')}</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[color:var(--text-tertiary)] text-xs">{t('loans.requestId')}</dt>
                <dd className="text-[color:var(--text-primary)] font-mono text-xs mt-0.5">{request.id}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--text-tertiary)] text-xs">{t('common.status')}</dt>
                <dd className="mt-0.5"><StatusBadge status={request.status} /></dd>
              </div>
              <div>
                <dt className="text-[color:var(--text-tertiary)] text-xs">{t('common.amount')}</dt>
                <dd className="text-[color:var(--text-primary)] mt-0.5 tabular-nums">{formatMoney(request.requestedAmount, request.currency)}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--text-tertiary)] text-xs">{t('loans.channel')}</dt>
                <dd className="text-[color:var(--text-primary)] mt-0.5 capitalize">{request.channel}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.customer')}</dt>
                <dd className="text-[color:var(--text-primary)] mt-0.5">
                  {request.customer?.fullName || request.customerId.slice(0, 12) + '...'}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.product')}</dt>
                <dd className="text-[color:var(--text-primary)] mt-0.5">
                  {request.product?.name || request.productId.slice(0, 12) + '...'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.submitted')}</dt>
                <dd className="text-[color:var(--text-primary)] mt-0.5">{formatDateTime(request.createdAt)}</dd>
              </div>
            </dl>
          </div>

          {/* AML Screening Check */}
          <div className="card p-4 space-y-3">
            <h3 className="section-label">{t('loans.applications.detail.amlScreening')}</h3>
            {screeningLoading ? (
              <p className="text-[color:var(--text-tertiary)] text-sm">{t('loans.applications.detail.loadingScreening')}</p>
            ) : screening ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <AmlBadge status={screening.status} />
                  {screening.riskLevel && (
                    <span className={`text-xs font-semibold ${
                      screening.riskLevel === 'LOW' ? 'text-[color:var(--status-success-text)]' :
                      screening.riskLevel === 'MEDIUM' ? 'text-[color:var(--status-warning-text)]' :
                      screening.riskLevel === 'HIGH' ? 'text-[color:var(--status-warning-text)]' :
                      'text-[color:var(--status-error-text)]'
                    }`}>
                      {t('loans.applications.detail.riskPrefix')}{screening.riskLevel}
                    </span>
                  )}
                </div>
                <p className="text-[color:var(--text-tertiary)] text-xs">
                  {t('loans.applications.detail.lastScreened')}{formatDateTime(screening.screenedAt)}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]">
                  {t('loans.applications.detail.notScreened')}
                </span>
                <span className="text-[color:var(--text-tertiary)] text-xs">{t('loans.applications.detail.noScreeningRecords')}</span>
              </div>
            )}
          </div>

          {/* Exposure Check */}
          <div className="card p-4 space-y-3">
            <h3 className="section-label">{t('loans.applications.detail.exposureCheck')}</h3>
            {exposureLoading ? (
              <p className="text-[color:var(--text-tertiary)] text-sm">{t('loans.applications.detail.loadingExposure')}</p>
            ) : exposure ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[color:var(--text-secondary)]">{t('loans.applications.detail.totalExposure')}</span>
                  <span className="text-sm text-[color:var(--text-primary)] font-medium tabular-nums">
                    {formatMoney(exposure.totalExposure, request.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[color:var(--text-secondary)]">{t('loans.applications.detail.maxAllowed')}</span>
                  <span className="text-sm text-[color:var(--text-primary)] font-medium tabular-nums">
                    {parseFloat(exposure.maxAllowed) > 0
                      ? formatMoney(exposure.maxAllowed, request.currency)
                      : t('loans.applications.detail.noLimitSet')}
                  </span>
                </div>
                {parseFloat(exposure.maxAllowed) > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[color:var(--text-tertiary)]">{t('loans.applications.detail.utilization')}</span>
                      <span className={`text-xs font-medium ${exposureColor}`}>
                        {utilizationPercent !== null ? `${utilizationPercent.toFixed(1)}%` : t('loans.applications.detail.notAvailable')}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[color:var(--bg-muted)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          utilizationPercent !== null && utilizationPercent < 60
                            ? 'bg-[color:var(--status-success)]'
                            : utilizationPercent !== null && utilizationPercent < 80
                              ? 'bg-[color:var(--status-warning)]'
                              : 'bg-[color:var(--status-error)]'
                        }`}
                        style={{ width: `${Math.min(utilizationPercent ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                <p className={`text-xs font-medium tabular-nums ${exposureColor}`}>
                  {t('loans.applications.detail.exposurePrefix')}{formatMoney(exposure.totalExposure, request.currency)}
                  {parseFloat(exposure.maxAllowed) > 0 && (
                    <> / {formatMoney(exposure.maxAllowed, request.currency)} ({utilizationPercent?.toFixed(0) ?? 0}%)</>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.applications.detail.noExposureData')}</p>
            )}
          </div>

          {/* P1-012: manual approve/reject — only visible when the request
              is in manual_review. Approve uses the requested amount unless
              the operator types an override; reject requires a reason. */}
          {isManualReview && (
            <div className="card p-4 space-y-3">
              <h3 className="section-label">{t('loans.applications.detail.operatorDecision')}</h3>
              <div className="space-y-2">
                <label className="text-xs text-[color:var(--text-secondary)] block">
                  {t('loans.applications.detail.adjustedAmountLabel', { currency: request.currency })}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
                  placeholder={request.requestedAmount}
                  value={adjustedAmount}
                  onChange={(e) => setAdjustedAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-[color:var(--text-secondary)] block">
                  {t('loans.applications.detail.rejectionReasonLabel')}
                </label>
                <textarea
                  className="w-full rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3 py-2 text-sm text-[color:var(--text-primary)] resize-none"
                  rows={2}
                  placeholder={t('loans.applications.detail.rejectionReasonPlaceholder')}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
              {actionError && (
                <p className="text-xs text-[color:var(--status-error-text)]">{actionError}</p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approving}
                  className="flex-1 rounded-md bg-[color:var(--status-success)] text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {approving ? t('loans.applications.detail.working') : t('loans.review.approve')}
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={approving}
                  className="flex-1 rounded-md bg-[color:var(--status-error)] text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {approving ? t('loans.applications.detail.working') : t('loans.review.reject')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [selectedRequest, setSelectedRequest] = useState<LoanRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState('manual_review');

  const { data, loading, refetch } = useQuery(LOAN_REQUESTS_QUERY, {
    variables: { pagination: { first: 100 }, status: statusFilter || undefined },
  });
  const requests: LoanRequest[] = data?.loanRequests?.edges?.map((e: any) => e.node) || [];

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'manual_review' || r.status === 'pending').length;
    const approved = requests.filter((r) => r.status === 'approved').length;
    const rejected = requests.filter((r) => r.status === 'rejected').length;
    const totalAmount = requests.reduce((s, r) => s + Number(r.requestedAmount ?? 0), 0);
    return { pending, approved, rejected, totalAmount };
  }, [requests]);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.originationQueue')}
        title={t('loans.applicationQueue')}
        subtitle={t('loans.pendingReview')}
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title={t('loans.applications.kpi.awaitingReview')}
          value={loading ? '—' : stats.pending}
          subtitle={t('loans.applications.kpi.manualReviewQueue')}
          icon={<Clock className="w-4 h-4" />}
          live={stats.pending > 0}
        />
        <MetricCard
          variant="glow"
          title={t('loans.applications.kpi.approved')}
          value={loading ? '—' : stats.approved}
          subtitle={t('loans.applications.kpi.inCurrentView')}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('loans.applications.kpi.rejected')}
          value={loading ? '—' : stats.rejected}
          subtitle={t('loans.applications.kpi.inCurrentView')}
          icon={<XCircle className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('loans.applications.kpi.totalRequested')}
          value={loading ? '—' : formatMoney(String(stats.totalAmount.toFixed(2)), 'GHS')}
          subtitle={requests.length === 1 ? t('loans.applications.kpi.requestCountOne', { count: requests.length }) : t('loans.applications.kpi.requestCountOther', { count: requests.length })}
          icon={<ClipboardList className="w-4 h-4" />}
        />
      </section>

      {/* Filter */}
      <section className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">{t('common.filter')}</span>
        </div>
        <FilterPill
          options={[
            { value: '', label: t('common.allStatuses') },
            { value: 'manual_review', label: t('loans.applications.filter.manualReview') },
            // S18-1 — surface 'escalated' so seniors can pick up
            // escalated requests from the same queue.
            { value: 'escalated', label: t('loans.applications.filter.escalated') },
            { value: 'pending', label: t('loans.applications.filter.pending') },
            { value: 'approved', label: t('loans.applications.filter.approved') },
            { value: 'rejected', label: t('loans.applications.filter.rejected') },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {t('loans.applications.inQueue', { count: requests.length })}
        </span>
      </section>

      {/* Table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>{t('loans.requestId')}</Th>
                <Th>{t('loans.review.customer')}</Th>
                <Th>{t('loans.review.product')}</Th>
                <Th>{t('loans.amount')}</Th>
                <Th>{t('loans.channel')}</Th>
                <Th>{t('loans.status')}</Th>
                <Th>{t('common.created')}</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <ClipboardList className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {t('loans.noApplications')}
                    </p>
                  </td>
                </tr>
              ) : (
                requests.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={(e) => {
                      // S18-1 — chevron click opens legacy drawer; row
                      // click navigates to the new review detail page.
                      if ((e.target as HTMLElement).closest('[data-row-action="drawer"]')) {
                        setSelectedRequest(r);
                      } else {
                        router.push(`/loans/applications/${r.id}`);
                      }
                    }}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
                  >
                    <Td>
                      <span className="text-[12px] font-mono text-[color:var(--text-tertiary)]">
                        {r.id.slice(0, 8)}…
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-primary)] font-medium">
                        {r.customer?.fullName || r.customerId.slice(0, 12) + '…'}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-secondary)]">
                        {r.product?.name || r.productId.slice(0, 12) + '…'}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-primary)] tabular-nums font-semibold">
                        {formatMoney(r.requestedAmount, r.currency)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-secondary)] capitalize text-[12px]">
                        {r.channel}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td>
                      <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                        {formatDate(r.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRequest && (
        <ApplicationDetailDrawer
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onChanged={() => { void refetch(); }}
        />
      )}
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
