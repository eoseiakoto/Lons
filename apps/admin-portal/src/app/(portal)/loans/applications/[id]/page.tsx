'use client';

/**
 * Sprint 18 (S18-1) — loan application review detail page.
 *
 * Wires the four S18-1 mutations (approve / reject / escalate / modify
 * terms) from `loan-request-review.resolver.ts` into a single screen.
 * Backed by the existing `loanRequest` query in
 * `loan-request.resolver.ts` plus the audit log and scoring result
 * relations.
 *
 * The page intentionally lives at `/loans/applications/[id]` so the
 * existing list page (queue) can deep-link into it. The legacy drawer
 * on the list page still works — operators with simpler workflows can
 * keep using it.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { gql, useMutation, useQuery } from '@apollo/client';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  X as XIcon,
  ArrowUpCircle,
  Edit3,
  AlertCircle,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { SlideOver } from '@/components/ui/slide-over';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDateTime } from '@/lib/utils';

// ── GraphQL ──────────────────────────────────────────────────────────

const LOAN_REQUEST_DETAIL = gql`
  query LoanRequestDetail($id: ID!) {
    loanRequest(id: $id) {
      id
      customerId
      productId
      requestedAmount
      requestedTenor
      currency
      status
      channel
      createdAt
      approvedAmount
      approvedTenor
      metadata
      customer {
        id
        fullName
        phonePrimary
      }
      product {
        id
        name
        minAmount
        maxAmount
        maxTenorDays
        type
      }
      scoringResult {
        id
        score
        riskTier
        modelVersion
        recommendedLimit
        inputFeatures
      }
    }
  }
`;

const APPROVE_MUT = gql`
  mutation ApproveLoanRequest(
    $loanRequestId: ID!
    $approvedAmount: String!
    $approvedTenor: Int!
    $idempotencyKey: String
  ) {
    approveLoanRequest(
      loanRequestId: $loanRequestId
      approvedAmount: $approvedAmount
      approvedTenor: $approvedTenor
      idempotencyKey: $idempotencyKey
    ) {
      id
      status
      approvedAmount
      approvedTenor
    }
  }
`;

const REJECT_MUT = gql`
  mutation RejectLoanRequest(
    $loanRequestId: ID!
    $rejectionReasons: [RejectionReasonInput!]!
    $idempotencyKey: String
  ) {
    rejectLoanRequest(
      loanRequestId: $loanRequestId
      rejectionReasons: $rejectionReasons
      idempotencyKey: $idempotencyKey
    ) {
      id
      status
    }
  }
`;

const ESCALATE_MUT = gql`
  mutation EscalateLoanRequest(
    $loanRequestId: ID!
    $escalationReason: String!
    $escalatedTo: ID
    $idempotencyKey: String
  ) {
    escalateLoanRequest(
      loanRequestId: $loanRequestId
      escalationReason: $escalationReason
      escalatedTo: $escalatedTo
      idempotencyKey: $idempotencyKey
    ) {
      id
      status
    }
  }
`;

const MODIFY_TERMS_MUT = gql`
  mutation ModifyLoanRequestTerms(
    $loanRequestId: ID!
    $input: ModifyTermsInput!
    $idempotencyKey: String
  ) {
    modifyLoanRequestTerms(
      loanRequestId: $loanRequestId
      input: $input
      idempotencyKey: $idempotencyKey
    ) {
      id
      status
      metadata
    }
  }
`;

// Predefined rejection codes the BA shipped with the spec.
const REJECTION_CODES = [
  { code: 'LOW_CREDIT_SCORE', labelKey: 'loans.review.reject.codes.lowCreditScore' },
  { code: 'INSUFFICIENT_INCOME', labelKey: 'loans.review.reject.codes.insufficientIncome' },
  { code: 'HIGH_DEBT_RATIO', labelKey: 'loans.review.reject.codes.highDebtRatio' },
  { code: 'POLICY_VIOLATION', labelKey: 'loans.review.reject.codes.policyViolation' },
  { code: 'DOCUMENTATION_INCOMPLETE', labelKey: 'loans.review.reject.codes.docIncomplete' },
  { code: 'OTHER', labelKey: 'loans.review.reject.codes.other' },
];

type Panel = 'approve' | 'reject' | 'escalate' | 'modify' | null;

export default function LoanApplicationReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { toast } = useToast();
  const loanRequestId = params?.id;

  const { data, loading, refetch } = useQuery(LOAN_REQUEST_DETAIL, {
    variables: { id: loanRequestId },
    skip: !loanRequestId,
    fetchPolicy: 'cache-and-network',
  });

  const [panel, setPanel] = useState<Panel>(null);

  const [approveMut, { loading: approving }] = useMutation(APPROVE_MUT);
  const [rejectMut, { loading: rejecting }] = useMutation(REJECT_MUT);
  const [escalateMut, { loading: escalating }] = useMutation(ESCALATE_MUT);
  const [modifyTermsMut, { loading: modifying }] = useMutation(MODIFY_TERMS_MUT);

  if (loading && !data) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <p className="text-[color:var(--text-tertiary)]">{t('common.loading')}</p>
      </div>
    );
  }

  const lr = data?.loanRequest;
  if (!lr) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <p className="text-[color:var(--text-tertiary)]">{t('loans.review.notFound')}</p>
      </div>
    );
  }

  const isActionable = lr.status === 'manual_review' || lr.status === 'escalated';
  const score = lr.scoringResult?.score ?? null;
  const recommendedLimit = lr.scoringResult?.recommendedLimit ?? lr.requestedAmount;

  // ── Action handlers ────────────────────────────────────────────────
  const onClose = () => setPanel(null);

  const handleApprove = async (amount: string, tenor: number) => {
    try {
      await approveMut({
        variables: {
          loanRequestId,
          approvedAmount: amount,
          approvedTenor: tenor,
          idempotencyKey: `approve-${loanRequestId}-${Date.now()}`,
        },
      });
      toast('success', t('loans.review.toast.approved'));
      onClose();
      void refetch();
    } catch (e) {
      toast('error', (e as Error).message || t('loans.review.toast.approveFailed'));
    }
  };

  const handleReject = async (reasons: { code: string; message: string }[]) => {
    try {
      await rejectMut({
        variables: {
          loanRequestId,
          rejectionReasons: reasons,
          idempotencyKey: `reject-${loanRequestId}-${Date.now()}`,
        },
      });
      toast('success', t('loans.review.toast.rejected'));
      onClose();
      void refetch();
    } catch (e) {
      toast('error', (e as Error).message || t('loans.review.toast.rejectFailed'));
    }
  };

  const handleEscalate = async (reason: string, assignee: string | null) => {
    try {
      await escalateMut({
        variables: {
          loanRequestId,
          escalationReason: reason,
          escalatedTo: assignee,
          idempotencyKey: `escalate-${loanRequestId}-${Date.now()}`,
        },
      });
      toast('success', t('loans.review.toast.escalated'));
      onClose();
      void refetch();
    } catch (e) {
      toast('error', (e as Error).message || t('loans.review.toast.escalateFailed'));
    }
  };

  const handleModify = async (input: {
    adjustedAmount?: string;
    adjustedTenor?: number;
    adjustedInterestRate?: string;
    modificationReason: string;
  }) => {
    try {
      await modifyTermsMut({
        variables: {
          loanRequestId,
          input,
          idempotencyKey: `modify-${loanRequestId}-${Date.now()}`,
        },
      });
      toast('success', t('loans.review.toast.modified'));
      onClose();
      void refetch();
    } catch (e) {
      toast('error', (e as Error).message || t('loans.review.toast.modifyFailed'));
    }
  };

  return (
    <div className="relative space-y-6 animate-enter">
      <PageBackdrop />

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/loans/applications')}
          className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('loans.review.backToQueue')}
        </button>
      </div>

      <PageHeader
        eyebrow={t('eyebrow.applicationReview')}
        title={t('loans.review.title')}
        subtitle={lr.id}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header card */}
          <section className="card-glow p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">
                  {t('loans.review.application')}
                </p>
                <h2 className="text-[18px] font-semibold text-[color:var(--text-primary)]">
                  {lr.customer?.fullName ?? lr.customerId.slice(0, 12) + '…'}
                </h2>
                <p className="text-[13px] text-[color:var(--text-tertiary)] mt-1">
                  {lr.product?.name} · {lr.channel}
                </p>
              </div>
              <StatusBadge status={lr.status} />
            </div>

            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm pt-4 border-t border-[color:var(--border-subtle)]">
              <Field label={t('loans.amount')}>
                <span className="tabular-nums font-semibold">
                  {formatMoney(lr.requestedAmount, lr.currency)}
                </span>
              </Field>
              <Field label={t('loans.review.tenor')}>
                <span className="tabular-nums">{lr.requestedTenor ?? lr.product?.maxTenorDays ?? '—'} d</span>
              </Field>
              <Field label={t('common.submitted')}>
                <span>{formatDateTime(lr.createdAt)}</span>
              </Field>
              {lr.customer?.phonePrimary && (
                <Field label={t('loans.review.phone')}>
                  <span className="tabular-nums">{lr.customer.phonePrimary}</span>
                </Field>
              )}
              {lr.approvedAmount && (
                <Field label={t('loans.review.approvedAmount')}>
                  <span className="tabular-nums font-semibold text-[color:var(--status-success-text)]">
                    {formatMoney(lr.approvedAmount, lr.currency)}
                  </span>
                </Field>
              )}
            </dl>
          </section>

          {/* Scoring */}
          <section className="card-glow p-6">
            <h3 className="section-label mb-3">{t('loans.review.scoring.title')}</h3>
            {lr.scoringResult ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Field label={t('loans.review.scoring.score')}>
                  <span className="tabular-nums text-[18px] font-semibold">{score ?? '—'}</span>
                </Field>
                <Field label={t('loans.review.scoring.riskTier')}>
                  <span className="capitalize">{lr.scoringResult.riskTier ?? '—'}</span>
                </Field>
                <Field label={t('loans.review.scoring.modelVersion')}>
                  <span className="text-xs font-mono">{lr.scoringResult.modelVersion ?? '—'}</span>
                </Field>
                <Field label={t('loans.review.scoring.recommendedLimit')}>
                  <span className="tabular-nums">
                    {recommendedLimit
                      ? formatMoney(String(recommendedLimit), lr.currency)
                      : '—'}
                  </span>
                </Field>
              </div>
            ) : (
              <p className="text-[color:var(--text-tertiary)] text-sm">
                {t('loans.review.scoring.notScored')}
              </p>
            )}
          </section>

          {/* Audit trail */}
          <section className="card-glow p-6">
            <h3 className="section-label mb-3">{t('loans.review.audit.title')}</h3>
            <AuditTrail metadata={lr.metadata} />
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="card-glow p-6 space-y-3">
            <h3 className="section-label">{t('loans.review.actions.title')}</h3>
            {!isActionable && (
              <p className="text-xs text-[color:var(--text-tertiary)] mb-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{t('loans.review.actions.notActionable')}</span>
              </p>
            )}
            <ActionButton
              onClick={() => setPanel('approve')}
              disabled={!isActionable}
              variant="success"
              icon={<Check className="w-4 h-4" />}
              label={t('loans.review.button.approve')}
            />
            <ActionButton
              onClick={() => setPanel('reject')}
              disabled={!isActionable}
              variant="error"
              icon={<XIcon className="w-4 h-4" />}
              label={t('loans.review.button.reject')}
            />
            <ActionButton
              onClick={() => setPanel('escalate')}
              disabled={lr.status !== 'manual_review'}
              variant="warning"
              icon={<ArrowUpCircle className="w-4 h-4" />}
              label={t('loans.review.button.escalate')}
            />
            <ActionButton
              onClick={() => setPanel('modify')}
              disabled={!isActionable}
              variant="neutral"
              icon={<Edit3 className="w-4 h-4" />}
              label={t('loans.review.button.modifyTerms')}
            />
          </section>

          <section className="card-glow p-5">
            <h3 className="section-label mb-2">{t('loans.review.customer')}</h3>
            <Link
              href={`/customers/${lr.customerId}`}
              className="text-[13px] text-[color:var(--accent-primary-deep)] hover:underline flex items-center gap-1"
            >
              {t('loans.review.viewCustomer')}
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </section>
        </aside>
      </div>

      {/* Slide-over panels */}
      {panel === 'approve' && (
        <ApprovePanel
          onClose={onClose}
          onSubmit={handleApprove}
          loading={approving}
          requestedAmount={lr.requestedAmount}
          recommendedLimit={String(recommendedLimit ?? lr.requestedAmount)}
          currency={lr.currency}
          tenor={lr.requestedTenor ?? lr.product?.maxTenorDays ?? 30}
        />
      )}
      {panel === 'reject' && (
        <RejectPanel onClose={onClose} onSubmit={handleReject} loading={rejecting} />
      )}
      {panel === 'escalate' && (
        <EscalatePanel onClose={onClose} onSubmit={handleEscalate} loading={escalating} />
      )}
      {panel === 'modify' && (
        <ModifyPanel
          onClose={onClose}
          onSubmit={handleModify}
          loading={modifying}
          currentAmount={lr.requestedAmount}
          currentTenor={lr.requestedTenor ?? lr.product?.maxTenorDays ?? 30}
          currency={lr.currency}
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-0.5">
        {label}
      </dt>
      <dd className="text-[color:var(--text-primary)]">{children}</dd>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: 'success' | 'error' | 'warning' | 'neutral';
  icon: React.ReactNode;
  label: string;
}) {
  const variantClass: Record<typeof variant, string> = {
    success: 'bg-[color:var(--status-success)] text-white hover:opacity-90',
    error: 'bg-[color:var(--status-error)] text-white hover:opacity-90',
    warning: 'bg-[color:var(--status-warning)] text-white hover:opacity-90',
    neutral:
      'bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)] border border-[color:var(--border-default)] hover:bg-[color:var(--bg-hover)]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-md px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${variantClass[variant]}`}
    >
      {icon}
      {label}
    </button>
  );
}

function AuditTrail({ metadata }: { metadata: Record<string, unknown> | null | undefined }) {
  const { t } = useI18n();
  const meta = metadata || {};
  const events: { label: string; at?: string; by?: string }[] = [];
  if (meta.reviewedAt) {
    events.push({
      label: t('loans.review.audit.reviewed'),
      at: String(meta.reviewedAt),
      by: String(meta.reviewedBy ?? ''),
    });
  }
  if (meta.escalation && typeof meta.escalation === 'object') {
    const esc = meta.escalation as Record<string, string>;
    events.push({
      label: t('loans.review.audit.escalated'),
      at: esc.escalatedAt,
      by: esc.escalatedBy,
    });
  }
  if (meta.termModifications && typeof meta.termModifications === 'object') {
    const tm = meta.termModifications as Record<string, string>;
    events.push({
      label: t('loans.review.audit.termsModified'),
      at: tm.modifiedAt,
      by: tm.modifiedBy,
    });
  }
  if (events.length === 0) {
    return <p className="text-xs text-[color:var(--text-tertiary)]">{t('loans.review.audit.empty')}</p>;
  }
  return (
    <ul className="space-y-2">
      {events.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent-primary)] mt-1.5 flex-shrink-0" />
          <div>
            <p className="text-[color:var(--text-primary)]">{e.label}</p>
            <p className="text-xs text-[color:var(--text-tertiary)] tabular-nums">
              {e.at ? formatDateTime(e.at) : '—'}
              {e.by && (
                <>
                  {' · '}
                  <span className="font-mono">{e.by.slice(0, 8)}…</span>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Slide-over forms ─────────────────────────────────────────────────

function ApprovePanel({
  onClose,
  onSubmit,
  loading,
  requestedAmount,
  recommendedLimit,
  currency,
  tenor: defaultTenor,
}: {
  onClose: () => void;
  onSubmit: (amount: string, tenor: number) => void | Promise<void>;
  loading?: boolean;
  requestedAmount: string;
  recommendedLimit: string;
  currency: string;
  tenor: number;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(String(recommendedLimit || requestedAmount));
  const [tenor, setTenor] = useState(defaultTenor);
  return (
    <SlideOver title={t('loans.review.button.approve')} subtitle={currency} onClose={onClose}>
      <div className="space-y-4">
        <FormField label={t('loans.review.approve.amount')}>
          <input
            type="text"
            inputMode="decimal"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="hint">{t('loans.review.approve.requestedHint')}: {requestedAmount}</p>
        </FormField>
        <FormField label={t('loans.review.approve.tenor')}>
          <input
            type="number"
            min={1}
            className="form-input"
            value={tenor}
            onChange={(e) => setTenor(parseInt(e.target.value || '0', 10))}
          />
        </FormField>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => onSubmit(amount, tenor)}
            disabled={loading || !amount || tenor < 1}
          >
            {loading ? t('common.working') : t('loans.review.button.approve')}
          </button>
        </div>
      </div>
      <FormStyles />
    </SlideOver>
  );
}

function RejectPanel({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (reasons: { code: string; message: string }[]) => void | Promise<void>;
  loading?: boolean;
}) {
  const { t } = useI18n();
  const [selectedCode, setSelectedCode] = useState('LOW_CREDIT_SCORE');
  const [detail, setDetail] = useState('');
  return (
    <SlideOver title={t('loans.review.button.reject')} onClose={onClose}>
      <div className="space-y-4">
        <FormField label={t('loans.review.reject.reasonCode')}>
          <select
            className="form-input"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
          >
            {REJECTION_CODES.map((r) => (
              <option key={r.code} value={r.code}>
                {t(r.labelKey)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('loans.review.reject.detail')}>
          <textarea
            className="form-input min-h-[120px]"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('loans.review.reject.detailPlaceholder')}
          />
        </FormField>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-danger flex-1"
            onClick={() =>
              onSubmit([{ code: selectedCode, message: detail || selectedCode }])
            }
            disabled={loading || !detail.trim()}
          >
            {loading ? t('common.working') : t('loans.review.button.reject')}
          </button>
        </div>
      </div>
      <FormStyles />
    </SlideOver>
  );
}

function EscalatePanel({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (reason: string, assignee: string | null) => void | Promise<void>;
  loading?: boolean;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState('');
  return (
    <SlideOver title={t('loans.review.button.escalate')} onClose={onClose}>
      <div className="space-y-4">
        <FormField label={t('loans.review.escalate.reason')}>
          <textarea
            className="form-input min-h-[120px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('loans.review.escalate.reasonPlaceholder')}
          />
        </FormField>
        <FormField label={t('loans.review.escalate.assigneeOptional')}>
          <input
            type="text"
            className="form-input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder={t('loans.review.escalate.assigneePlaceholder')}
          />
          <p className="hint">{t('loans.review.escalate.assigneeHint')}</p>
        </FormField>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-warning flex-1"
            onClick={() => onSubmit(reason, assignee.trim() || null)}
            disabled={loading || !reason.trim()}
          >
            {loading ? t('common.working') : t('loans.review.button.escalate')}
          </button>
        </div>
      </div>
      <FormStyles />
    </SlideOver>
  );
}

function ModifyPanel({
  onClose,
  onSubmit,
  loading,
  currentAmount,
  currentTenor,
  currency,
}: {
  onClose: () => void;
  onSubmit: (input: {
    adjustedAmount?: string;
    adjustedTenor?: number;
    adjustedInterestRate?: string;
    modificationReason: string;
  }) => void | Promise<void>;
  loading?: boolean;
  currentAmount: string;
  currentTenor: number;
  currency: string;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState('');
  const [tenor, setTenor] = useState('');
  const [rate, setRate] = useState('');
  const [reason, setReason] = useState('');
  return (
    <SlideOver title={t('loans.review.button.modifyTerms')} subtitle={currency} onClose={onClose}>
      <div className="space-y-4">
        <FormField label={t('loans.review.modify.amount')}>
          <input
            type="text"
            inputMode="decimal"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currentAmount}
          />
        </FormField>
        <FormField label={t('loans.review.modify.tenor')}>
          <input
            type="number"
            min={1}
            className="form-input"
            value={tenor}
            onChange={(e) => setTenor(e.target.value)}
            placeholder={String(currentTenor)}
          />
        </FormField>
        <FormField label={t('loans.review.modify.rate')}>
          <input
            type="text"
            inputMode="decimal"
            className="form-input"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 14.5000"
          />
        </FormField>
        <FormField label={t('loans.review.modify.reason')}>
          <textarea
            className="form-input min-h-[100px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() =>
              onSubmit({
                adjustedAmount: amount || undefined,
                adjustedTenor: tenor ? parseInt(tenor, 10) : undefined,
                adjustedInterestRate: rate || undefined,
                modificationReason: reason,
              })
            }
            disabled={loading || !reason.trim()}
          >
            {loading ? t('common.working') : t('loans.review.modify.submit')}
          </button>
        </div>
      </div>
      <FormStyles />
    </SlideOver>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[color:var(--text-secondary)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function FormStyles() {
  // Inline style block keeps the slide-over self-contained — no global
  // CSS additions needed for the four form panels.
  return (
    <style jsx>{`
      :global(.form-input) {
        width: 100%;
        border-radius: 6px;
        border: 1px solid var(--border-subtle);
        background: var(--bg-card);
        color: var(--text-primary);
        padding: 8px 12px;
        font-size: 14px;
      }
      :global(.form-input:focus) {
        outline: none;
        border-color: var(--accent-primary);
        box-shadow: 0 0 0 3px var(--accent-primary-soft);
      }
      :global(.hint) {
        font-size: 11px;
        color: var(--text-tertiary);
        margin-top: 4px;
      }
      :global(.btn-primary) {
        background: var(--accent-primary);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      :global(.btn-primary:disabled) { opacity: 0.5; cursor: not-allowed; }
      :global(.btn-secondary) {
        background: var(--bg-elevated);
        color: var(--text-primary);
        border: 1px solid var(--border-default);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      :global(.btn-danger) {
        background: var(--status-error);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      :global(.btn-warning) {
        background: var(--status-warning);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
    `}</style>
  );
}
