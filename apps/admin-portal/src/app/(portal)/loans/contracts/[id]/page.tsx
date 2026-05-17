'use client';

import { useMemo, useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  FileText,
  X,
  Check,
  Calendar,
  Banknote,
  Settings2,
  Gift,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SlideOver } from '@/components/ui/slide-over';

const CONTRACT_QUERY = gql`
  query Contract($id: ID!) {
    contract(id: $id) {
      id contractNumber customerId productId lenderId currency
      principalAmount interestRate interestAmount totalFees totalCostCredit
      outstandingPrincipal outstandingInterest outstandingFees outstandingPenalties
      totalOutstanding totalPaid daysPastDue tenorDays
      status classification repaymentMethod
      startDate maturityDate createdAt
      metadata
    }
    repaymentSchedule(contractId: $id) {
      id installmentNumber dueDate principalAmount interestAmount feeAmount
      totalAmount paidAmount status paidAt
    }
  }
`;

const CANCEL_COOLING_OFF = gql`
  mutation CancelContractDuringCoolingOff($contractId: ID!) {
    cancelContractDuringCoolingOff(contractId: $contractId) {
      id
      status
    }
  }
`;

// Sprint 18 (S18-2) — operator write operations on a live contract.
const RECORD_MANUAL_PAYMENT = gql`
  mutation RecordManualPayment(
    $contractId: ID!
    $input: ManualPaymentInput!
    $idempotencyKey: String!
  ) {
    recordManualPayment(
      contractId: $contractId
      input: $input
      idempotencyKey: $idempotencyKey
    ) {
      id
      amount
      status
    }
  }
`;

const RESTRUCTURE_CONTRACT = gql`
  mutation RestructureContract(
    $contractId: ID!
    $input: RestructureContractInput!
    $idempotencyKey: String
  ) {
    restructureContract(
      contractId: $contractId
      input: $input
      idempotencyKey: $idempotencyKey
    ) {
      id
      tenorDays
      interestRate
      maturityDate
    }
  }
`;

const WAIVE_PENALTIES = gql`
  mutation WaivePenalties(
    $contractId: ID!
    $input: WaivePenaltiesInput!
    $idempotencyKey: String
  ) {
    waivePenalties(
      contractId: $contractId
      input: $input
      idempotencyKey: $idempotencyKey
    ) {
      id
      outstandingPenalties
      totalOutstanding
    }
  }
`;

interface Installment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalAmount?: string;
  interestAmount?: string;
  feeAmount?: string;
  totalAmount: string;
  paidAmount: string;
  status: string;
  paidAt?: string;
}

export default function ContractDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const { data, loading, refetch } = useQuery(CONTRACT_QUERY, { variables: { id } });
  const [cancelContract, { loading: cancelling }] = useMutation(CANCEL_COOLING_OFF);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // S18-2 — operator write-operation slide-overs.
  type OpPanel = 'payment' | 'restructure' | 'waive' | null;
  const [opPanel, setOpPanel] = useState<OpPanel>(null);
  const [recordManualPayment, { loading: recordingPayment }] = useMutation(RECORD_MANUAL_PAYMENT);
  const [restructureContract, { loading: restructuring }] = useMutation(RESTRUCTURE_CONTRACT);
  const [waivePenalties, { loading: waiving }] = useMutation(WAIVE_PENALTIES);

  if (loading)
    return <div className="text-sm text-[color:var(--text-tertiary)] py-12 text-center">{t('common.loading')}</div>;
  const contract = data?.contract;
  const schedule: Installment[] = data?.repaymentSchedule || [];
  if (!contract)
    return <div className="text-sm text-[color:var(--text-tertiary)] py-12 text-center">{t('loans.contractsDetail.notFound')}</div>;

  const c = contract;

  const metadata = c.metadata
    ? typeof c.metadata === 'string'
      ? JSON.parse(c.metadata)
      : c.metadata
    : {};
  const coolingOffExpiresAt = metadata?.coolingOffExpiresAt;
  const isCoolingOff = c.status === 'cooling_off';

  const repaidPct = useMemo(() => {
    const paid = Number(c.totalPaid ?? 0);
    const total = paid + Number(c.totalOutstanding ?? 0);
    return total > 0 ? (paid / total) * 100 : 0;
  }, [c.totalPaid, c.totalOutstanding]);

  const handleCancelCoolingOff = async () => {
    try {
      await cancelContract({ variables: { contractId: id } });
      toast('success', t('loans.contractsDetail.cancelSuccess'));
      setShowCancelConfirm(false);
      refetch();
    } catch (err: any) {
      toast('error', err?.message || t('loans.contractsDetail.cancelFailed'));
    }
  };

  return (
    <div className="relative space-y-6 animate-enter">
      <PageBackdrop />

      <button
        onClick={() => router.back()}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      {/* Cooling-off banner */}
      {isCoolingOff && (
        <div
          className="relative z-10 rounded-xl p-5 flex items-start gap-4"
          style={{
            backgroundColor: 'var(--status-warning-soft)',
            border: '1px solid var(--status-warning)',
          }}
        >
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: 'var(--status-warning-soft)',
              color: 'var(--status-warning-text)',
            }}
          >
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-[color:var(--status-warning-text)]">
              {t('loans.contractsDetail.coolingOffActive')}
            </p>
            <p className="text-[13px] text-[color:var(--text-secondary)] mt-1">
              {t('loans.contractsDetail.coolingOffDescription')}
            </p>
            {coolingOffExpiresAt && (
              <div className="flex items-center gap-2 mt-2 text-[12px] text-[color:var(--status-warning-text)]">
                <Clock className="w-3.5 h-3.5" />
                {t('loans.contractsDetail.expiresPrefix')}{formatDateTime(coolingOffExpiresAt)}
              </div>
            )}
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={cancelling}
              className="mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: 'var(--status-warning)',
                color: 'var(--text-on-accent)',
              }}
            >
              {t('loans.contractsDetail.cancelDuringCoolingOff')}
            </button>
          </div>
        </div>
      )}

      {/* Hero card */}
      <section className="relative z-10 card-glow-hero card-glow-sweep p-7 lg:p-9">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-5">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
                border: '1px solid var(--border-default)',
              }}
            >
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="live-dot" aria-hidden />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
                  {t('loans.contractsDetail.contractEyebrow')} · {c.repaymentMethod?.replace(/_/g, ' ')}
                </span>
              </div>
              <h1
                className="font-mono font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]"
                style={{ fontSize: 28, lineHeight: 1.05 }}
              >
                {c.contractNumber}
              </h1>
              <p className="text-[14px] text-[color:var(--text-secondary)] mt-2 tabular-nums">
                {formatMoney(c.principalAmount, c.currency)} · {t('loans.contractsDetail.daysCount', { count: c.tenorDays })} · {t('loans.contractsDetail.ratePercent', { rate: c.interestRate })}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={c.status} />
              <StatusBadge status={c.classification} />
            </div>
            {Number(c.daysPastDue) > 0 && (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium"
                style={{ color: 'var(--status-error-text)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--status-error)',
                    boxShadow: '0 0 6px var(--status-error)',
                  }}
                />
                {t('loans.contractsDetail.daysPastDue', { count: c.daysPastDue })}
              </span>
            )}
          </div>
        </div>

        <div
          className="mt-6 pt-5"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <ProgressBar
            value={repaidPct}
            max={100}
            size="md"
            label={t('loans.contractsDetail.repaymentProgress')}
            rightLabel={`${repaidPct.toFixed(1)}%`}
            variant="success"
          />
        </div>
      </section>

      {/* S18-2 — operator write operations (manual payment, restructure,
          waive). Only visible when the contract is in an actionable
          state; the resolver will reject otherwise. */}
      {['active', 'performing', 'due', 'overdue', 'delinquent'].includes(c.status) && (
        <section className="relative z-10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpPanel('payment')}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--text-on-accent)',
            }}
          >
            <Banknote className="w-3.5 h-3.5" />
            {t('loans.contractsDetail.recordPayment') || 'Record payment'}
          </button>
          <button
            type="button"
            onClick={() => setOpPanel('restructure')}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {t('loans.contractsDetail.restructure') || 'Restructure'}
          </button>
          <button
            type="button"
            onClick={() => setOpPanel('waive')}
            disabled={Number(c.outstandingPenalties ?? 0) <= 0}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <Gift className="w-3.5 h-3.5" />
            {t('loans.contractsDetail.waivePenalties') || 'Waive penalties'}
          </button>
        </section>
      )}

      {/* Two-column terms + outstanding */}
      <section className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-glow p-6">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-5">
            {t('loans.contractsDetail.contractTerms')}
          </h3>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
            {[
              [t('loans.principal'), formatMoney(c.principalAmount, c.currency)],
              [t('loans.contractsDetail.terms.interestRate'), `${c.interestRate}%`],
              [t('loans.contractsDetail.terms.totalInterest'), formatMoney(c.interestAmount || '0', c.currency)],
              [t('loans.contractsDetail.terms.totalFees'), formatMoney(c.totalFees || '0', c.currency)],
              [t('loans.contractsDetail.terms.totalCost'), formatMoney(c.totalCostCredit || '0', c.currency)],
              [t('loans.contractsDetail.terms.tenor'), t('loans.contractsDetail.daysCount', { count: c.tenorDays })],
              [t('loans.contractsDetail.terms.method'), c.repaymentMethod?.replace(/_/g, ' ') ?? '—'],
              [t('loans.contractsDetail.terms.start'), formatDate(c.startDate)],
              [t('loans.contractsDetail.terms.maturity'), formatDate(c.maturityDate)],
              [t('loans.dpd'), String(c.daysPastDue ?? 0)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">
                  {label}
                </dt>
                <dd className="text-[14px] text-[color:var(--text-primary)] capitalize tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card-glow p-6">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-5">
            {t('loans.contractsDetail.outstandingBalances')}
          </h3>
          <dl className="space-y-3 text-sm">
            {[
              [t('loans.principal'), c.outstandingPrincipal],
              [t('loans.contractsDetail.balances.interest'), c.outstandingInterest],
              [t('loans.contractsDetail.balances.fees'), c.outstandingFees],
              [t('loans.contractsDetail.balances.penalties'), c.outstandingPenalties],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between items-center">
                <dt className="text-[color:var(--text-tertiary)] text-[12px] uppercase tracking-wider">
                  {label}
                </dt>
                <dd className="text-[color:var(--text-primary)] tabular-nums">
                  {formatMoney((val as string) || '0', c.currency)}
                </dd>
              </div>
            ))}
            <div
              className="flex justify-between items-baseline pt-4"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <dt className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                {t('loans.contractsDetail.totalOutstanding')}
              </dt>
              <dd
                className="text-[24px] font-semibold tabular-nums"
                style={{
                  color: 'var(--status-error-text)',
                }}
              >
                {formatMoney(c.totalOutstanding || '0', c.currency)}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                {t('loans.contractsDetail.totalPaid')}
              </dt>
              <dd
                className="text-[14px] font-semibold tabular-nums"
                style={{ color: 'var(--status-success-text)' }}
              >
                {formatMoney(c.totalPaid || '0', c.currency)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Repayment schedule */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="flex items-baseline justify-between px-6 py-5 border-b border-[color:var(--border-subtle)]">
          <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[color:var(--accent-primary-deep)]" />
            {t('loans.contractsDetail.repaymentSchedule')}
          </h3>
          <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
            {t('loans.contractsDetail.installmentsCount', { count: schedule.length })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>#</Th>
                <Th>{t('loans.contractsDetail.schedule.dueDate')}</Th>
                <Th>{t('loans.principal')}</Th>
                <Th>{t('loans.contractsDetail.balances.interest')}</Th>
                <Th>{t('common.total')}</Th>
                <Th>{t('loans.contractsDetail.schedule.paid')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {schedule.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    {t('loans.contractsDetail.noSchedule')}
                  </td>
                </tr>
              ) : (
                schedule.map((r, i) => (
                  <tr
                    key={r.id}
                    className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <Td>
                      <span className="text-[color:var(--text-tertiary)] tabular-nums">
                        {r.installmentNumber}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12px] tabular-nums text-[color:var(--text-primary)]">
                        {formatDate(r.dueDate)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-secondary)] tabular-nums">
                        {formatMoney(r.principalAmount || '0', c.currency)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-secondary)] tabular-nums">
                        {formatMoney(r.interestAmount || '0', c.currency)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--text-primary)] font-semibold tabular-nums">
                        {formatMoney(r.totalAmount, c.currency)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[color:var(--accent-primary-deep)] tabular-nums">
                        {formatMoney(r.paidAmount, c.currency)}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cancel confirmation */}
      <AnimatePresence>
        {showCancelConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCancelConfirm(false)}
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
                <h3 className="text-[18px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  {t('loans.contractsDetail.confirmCancellation')}
                </h3>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[13px] text-[color:var(--text-secondary)] mb-5 leading-relaxed">
                {t('loans.contractsDetail.cancelConfirmPrefix')}{' '}
                <span className="font-mono text-[color:var(--text-primary)]">
                  {c.contractNumber}
                </span>{' '}
                {t('loans.contractsDetail.cancelConfirmSuffix')}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                  className="btn-ghost"
                >
                  {t('loans.contractsDetail.keepContract')}
                </button>
                <button
                  onClick={handleCancelCoolingOff}
                  disabled={cancelling}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--status-error-soft)',
                    color: 'var(--status-error-text)',
                    border: '1px solid var(--status-error)',
                  }}
                >
                  <Check className="w-3.5 h-3.5" />
                  {cancelling ? t('loans.contractsDetail.cancelling') : t('loans.contractsDetail.yesCancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* S18-2 operator slide-overs */}
      {opPanel === 'payment' && (
        <ContractManualPaymentPanel
          contractId={c.id}
          currency={c.currency}
          totalOutstanding={c.totalOutstanding ?? '0'}
          loading={recordingPayment}
          onClose={() => setOpPanel(null)}
          onSubmit={async (input) => {
            try {
              await recordManualPayment({
                variables: {
                  contractId: c.id,
                  input,
                  idempotencyKey: `mp:${c.id}:${input.paymentRef}`,
                },
              });
              toast('success', t('loans.contractsDetail.paymentRecorded') || 'Payment recorded');
              setOpPanel(null);
              void refetch();
            } catch (e) {
              toast('error', (e as Error).message);
            }
          }}
        />
      )}
      {opPanel === 'restructure' && (
        <ContractRestructurePanel
          tenorDays={c.tenorDays}
          interestRate={String(c.interestRate ?? '')}
          maturityDate={c.maturityDate}
          loading={restructuring}
          onClose={() => setOpPanel(null)}
          onSubmit={async (input) => {
            try {
              await restructureContract({
                variables: {
                  contractId: c.id,
                  input,
                  idempotencyKey: `rs:${c.id}:${Date.now()}`,
                },
              });
              toast('success', t('loans.contractsDetail.restructured') || 'Contract restructured');
              setOpPanel(null);
              void refetch();
            } catch (e) {
              toast('error', (e as Error).message);
            }
          }}
        />
      )}
      {opPanel === 'waive' && (
        <ContractWaivePenaltiesPanel
          currency={c.currency}
          outstandingPenalties={String(c.outstandingPenalties ?? '0')}
          loading={waiving}
          onClose={() => setOpPanel(null)}
          onSubmit={async (input) => {
            try {
              await waivePenalties({
                variables: {
                  contractId: c.id,
                  input,
                  idempotencyKey: `pw:${c.id}:${Date.now()}`,
                },
              });
              toast('success', t('loans.contractsDetail.penaltyWaived') || 'Penalties waived');
              setOpPanel(null);
              void refetch();
            } catch (e) {
              toast('error', (e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

// ── S18-2 slide-over panels ─────────────────────────────────────────

function ContractManualPaymentPanel({
  contractId: _contractId,
  currency,
  totalOutstanding,
  loading,
  onClose,
  onSubmit,
}: {
  contractId: string;
  currency: string;
  totalOutstanding: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    amount: string;
    currency: string;
    paymentMethod: string;
    paymentRef: string;
    paymentDate?: Date;
    notes?: string;
  }) => Promise<void> | void;
}) {
  const [amount, setAmount] = useState(totalOutstanding);
  const [method, setMethod] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <SlideOver title="Record payment" subtitle={currency} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <PanelField label="Amount">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="panel-input"
          />
          <p className="panel-hint">Outstanding: {totalOutstanding}</p>
        </PanelField>
        <PanelField label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="panel-input">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="mobile_money">Mobile money</option>
          </select>
        </PanelField>
        <PanelField label="Reference">
          <input
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Bank txn id, cheque number..."
            className="panel-input"
          />
        </PanelField>
        <PanelField label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="panel-input min-h-[80px]"
          />
        </PanelField>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={loading} className="panel-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                amount,
                currency,
                paymentMethod: method,
                paymentRef,
                notes: notes || undefined,
              })
            }
            disabled={loading || !amount || !paymentRef.trim()}
            className="panel-btn-primary flex-1"
          >
            {loading ? 'Working…' : 'Record payment'}
          </button>
        </div>
      </div>
      <PanelStyles />
    </SlideOver>
  );
}

function ContractRestructurePanel({
  tenorDays,
  interestRate,
  maturityDate,
  loading,
  onClose,
  onSubmit,
}: {
  tenorDays: number;
  interestRate: string;
  maturityDate: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    newTenorDays?: number;
    newInterestRate?: string;
    newMaturityDate?: Date;
    restructureReason: string;
  }) => Promise<void> | void;
}) {
  const [tenor, setTenor] = useState('');
  const [rate, setRate] = useState('');
  const [maturity, setMaturity] = useState('');
  const [reason, setReason] = useState('');
  return (
    <SlideOver title="Restructure contract" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-[12px] text-[color:var(--text-tertiary)]">
          Current: {tenorDays}d · {interestRate}% · matures {formatDate(maturityDate)}
        </p>
        <PanelField label="New tenor (days)">
          <input
            type="number"
            min={1}
            value={tenor}
            onChange={(e) => setTenor(e.target.value)}
            placeholder={String(tenorDays)}
            className="panel-input"
          />
        </PanelField>
        <PanelField label="New interest rate (%)">
          <input
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={interestRate}
            className="panel-input"
          />
        </PanelField>
        <PanelField label="New maturity date">
          <input
            type="date"
            value={maturity}
            onChange={(e) => setMaturity(e.target.value)}
            className="panel-input"
          />
        </PanelField>
        <PanelField label="Reason">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="panel-input min-h-[100px]"
          />
        </PanelField>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={loading} className="panel-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                newTenorDays: tenor ? parseInt(tenor, 10) : undefined,
                newInterestRate: rate || undefined,
                newMaturityDate: maturity ? new Date(maturity) : undefined,
                restructureReason: reason,
              })
            }
            disabled={loading || !reason.trim() || (!tenor && !rate && !maturity)}
            className="panel-btn-primary flex-1"
          >
            {loading ? 'Working…' : 'Restructure'}
          </button>
        </div>
      </div>
      <PanelStyles />
    </SlideOver>
  );
}

function ContractWaivePenaltiesPanel({
  currency,
  outstandingPenalties,
  loading,
  onClose,
  onSubmit,
}: {
  currency: string;
  outstandingPenalties: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (input: { waiverAmount: string; waiverReason: string }) => Promise<void> | void;
}) {
  const [amount, setAmount] = useState(outstandingPenalties);
  const [reason, setReason] = useState('');
  return (
    <SlideOver title="Waive penalties" subtitle={currency} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-[12px] text-[color:var(--text-tertiary)]">
          Outstanding penalties: {outstandingPenalties} {currency}
        </p>
        <PanelField label="Waiver amount">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="panel-input"
          />
        </PanelField>
        <PanelField label="Reason">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="panel-input min-h-[100px]"
          />
        </PanelField>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={loading} className="panel-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ waiverAmount: amount, waiverReason: reason })}
            disabled={loading || !amount || !reason.trim()}
            className="panel-btn-primary flex-1"
          >
            {loading ? 'Working…' : 'Waive'}
          </button>
        </div>
      </div>
      <PanelStyles />
    </SlideOver>
  );
}

function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[color:var(--text-secondary)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function PanelStyles() {
  return (
    <style jsx>{`
      :global(.panel-input) {
        width: 100%;
        border-radius: 6px;
        border: 1px solid var(--border-subtle);
        background: var(--bg-card);
        color: var(--text-primary);
        padding: 8px 12px;
        font-size: 14px;
      }
      :global(.panel-hint) {
        font-size: 11px;
        color: var(--text-tertiary);
        margin-top: 4px;
      }
      :global(.panel-btn-primary) {
        background: var(--accent-primary);
        color: var(--text-on-accent);
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      :global(.panel-btn-primary:disabled) { opacity: 0.5; cursor: not-allowed; }
      :global(.panel-btn-secondary) {
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
  );
}

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
