'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, User, Clock, Filter } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { SlideOver } from '@/components/ui/slide-over';
import { FilterPill } from '@/components/ui/filter-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  INVOICE_VERIFICATION_QUEUE_QUERY,
  CLAIM_INVOICE_MUTATION,
  APPROVE_INVOICE_MUTATION,
  REJECT_INVOICE_MUTATION,
  type IInvoice,
  type IVerificationQueueFilters,
} from '@/lib/graphql/factoring';

/**
 * S14-11 — Invoice Verification Queue page.
 *
 * Ops staff process invoices awaiting verification in FIFO order (oldest first).
 * Each row can be claimed (assigned to the current operator), then approved or
 * rejected via the detail slide-over. Flagging routes the invoice to the
 * general factoring pipeline for further review.
 */

type AssignedToFilter = '' | 'me' | 'unassigned';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'badge-warning' },
  verified: { label: 'Verified', className: 'badge-success' },
  failed: { label: 'Rejected', className: 'badge-error' },
  waived: { label: 'Waived', className: 'badge-neutral' },
};

const REJECT_REASON_OPTIONS = [
  { value: 'duplicate_invoice', label: 'Duplicate invoice' },
  { value: 'invalid_document', label: 'Invalid document' },
  { value: 'debtor_not_verified', label: 'Debtor not verified' },
  { value: 'amount_discrepancy', label: 'Amount discrepancy' },
  { value: 'other', label: 'Other' },
] as const;

const CHECKLIST_ITEMS = [
  { id: 'amount_match', label: 'Invoice amount matches supporting docs' },
  { id: 'debtor_verified', label: 'Debtor details verified' },
  { id: 'due_date_ok', label: 'Due date is within acceptable range' },
  { id: 'no_duplicate', label: 'No duplicate invoice exists' },
] as const;

type ChecklistId = (typeof CHECKLIST_ITEMS)[number]['id'];

export default function VerificationQueuePage() {
  const { t } = useI18n();
  const { toast } = useToast();

  // Filters
  const [assignedTo, setAssignedTo] = useState<AssignedToFilter>('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [debtorFilter, setDebtorFilter] = useState('');

  // Slide-over state
  const [selected, setSelected] = useState<IInvoice | null>(null);
  const [slideMode, setSlideMode] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('duplicate_invoice');
  const [checklist, setChecklist] = useState<Record<ChecklistId, boolean>>({
    amount_match: false,
    debtor_verified: false,
    due_date_ok: false,
    no_duplicate: false,
  });

  const filters: IVerificationQueueFilters = {
    ...(assignedTo && { assignedTo }),
    ...(sellerFilter.trim() && { sellerId: sellerFilter.trim() }),
    ...(debtorFilter.trim() && { debtorId: debtorFilter.trim() }),
  };

  const { data, loading, error, refetch } = useQuery(INVOICE_VERIFICATION_QUEUE_QUERY, {
    variables: {
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      pagination: { first: 50 },
    },
    fetchPolicy: 'cache-and-network',
  });

  const invoices: IInvoice[] =
    data?.invoiceVerificationQueue?.edges?.map((e: { node: IInvoice }) => e.node) ?? [];
  const totalCount: number = data?.invoiceVerificationQueue?.totalCount ?? 0;

  const [claimInvoice, { loading: claiming }] = useMutation(CLAIM_INVOICE_MUTATION);
  const [approveInvoice, { loading: approving }] = useMutation(APPROVE_INVOICE_MUTATION);
  const [rejectInvoice, { loading: rejecting }] = useMutation(REJECT_INVOICE_MUTATION);

  const handleClaim = useCallback(
    async (invoiceId: string) => {
      try {
        await claimInvoice({ variables: { invoiceId } });
        toast('success', 'Invoice claimed successfully');
        void refetch();
      } catch (err) {
        toast('error', (err as { message?: string }).message ?? 'Failed to claim invoice');
      }
    },
    [claimInvoice, refetch, toast],
  );

  const openSlide = (invoice: IInvoice, mode: 'approve' | 'reject') => {
    setSelected(invoice);
    setSlideMode(mode);
    setNotes('');
    setRejectReason('duplicate_invoice');
    setChecklist({ amount_match: false, debtor_verified: false, due_date_ok: false, no_duplicate: false });
  };

  const closeSlide = () => {
    setSelected(null);
    setSlideMode(null);
  };

  const handleSubmitVerification = async () => {
    if (!selected || !slideMode) return;
    try {
      if (slideMode === 'approve') {
        await approveInvoice({
          variables: {
            invoiceId: selected.id,
            input: { notes: notes.trim() || null, checklist },
          },
        });
        toast('success', 'Invoice approved — offer generation initiated');
      } else {
        if (!rejectReason) {
          toast('error', 'Rejection reason is required');
          return;
        }
        await rejectInvoice({
          variables: {
            invoiceId: selected.id,
            input: { reason: rejectReason, notes: notes.trim() || null },
          },
        });
        toast('success', 'Invoice rejected');
      }
      closeSlide();
      void refetch();
    } catch (err) {
      toast('error', (err as { message?: string }).message ?? 'Verification submission failed');
    }
  };

  const isSubmitting = approving || rejecting;

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow="Invoice Factoring"
        title="Verification Queue"
        subtitle={
          loading
            ? 'Loading queue…'
            : totalCount === 0
              ? 'No invoices pending verification'
              : `${totalCount} invoice${totalCount === 1 ? '' : 's'} pending verification`
        }
        actions={
          <Link
            href="/loans/factoring"
            className="glass-button text-sm inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Pipeline
          </Link>
        }
      />

      {/* Filter bar */}
      <section className="relative z-10 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">Filter</span>
        </div>
        <FilterPill
          label="Assigned to"
          options={[
            { value: '', label: 'All' },
            { value: 'me', label: 'Assigned to me' },
            { value: 'unassigned', label: 'Unassigned' },
          ]}
          value={assignedTo}
          onChange={(v) => setAssignedTo(v as AssignedToFilter)}
        />
        <input
          type="text"
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          placeholder="Filter by seller ID…"
          className="glass-input text-sm w-52 font-mono"
        />
        <input
          type="text"
          value={debtorFilter}
          onChange={(e) => setDebtorFilter(e.target.value)}
          placeholder="Filter by debtor ID…"
          className="glass-input text-sm w-52 font-mono"
        />
      </section>

      {/* Queue table */}
      <section className="relative z-10">
        {loading && invoices.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Failed to load queue"
            description={error.message}
          />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="Queue is clear"
            description="No invoices are awaiting verification. Check back after new submissions arrive."
          />
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border-subtle)] text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Invoice #</th>
                  <th className="px-4 py-3 text-left">Seller</th>
                  <th className="px-4 py-3 text-left">Debtor</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Due Date</th>
                  <th className="px-4 py-3 text-left">Submitted</th>
                  <th className="px-4 py-3 text-left">Assigned To</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border-subtle)]">
                {invoices.map((invoice) => {
                  const badge = STATUS_BADGE[invoice.verificationStatus] ?? {
                    label: invoice.verificationStatus,
                    className: 'badge-neutral',
                  };
                  return (
                    <tr
                      key={invoice.id}
                      className="hover:bg-[color:var(--bg-hover)] transition-colors cursor-pointer"
                      onClick={() => openSlide(invoice, 'approve')}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[color:var(--text-primary)]">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                        {invoice.seller?.fullName ?? invoice.sellerId.slice(0, 8) + '…'}
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                        {invoice.debtor?.companyName ?? invoice.debtorId.slice(0, 8) + '…'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[color:var(--text-primary)]">
                        {invoice.currency}{' '}
                        {parseFloat(invoice.faceValue).toLocaleString('en-GH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                        {new Date(invoice.dueDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text-tertiary)] text-xs">
                        {new Date(invoice.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.verifiedBy ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[color:var(--text-secondary)]">
                            <User className="w-3 h-3" />
                            {invoice.verifiedBy.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-xs text-[color:var(--text-tertiary)] italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge text-xs ${badge.className}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!invoice.verifiedBy && (
                            <button
                              type="button"
                              disabled={claiming}
                              onClick={() => handleClaim(invoice.id)}
                              className="glass-button text-xs inline-flex items-center gap-1"
                            >
                              <Clock className="w-3 h-3" />
                              Claim
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openSlide(invoice, 'approve')}
                            className="p-1.5 rounded-lg text-[color:var(--status-success)] hover:bg-[color:var(--status-success-bg)] transition-colors"
                            title="Approve invoice"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openSlide(invoice, 'reject')}
                            className="p-1.5 rounded-lg text-[color:var(--status-error)] hover:bg-[color:var(--status-error-bg)] transition-colors"
                            title="Reject invoice"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Verification slide-over */}
      {selected && slideMode && (
        <SlideOver
          title={slideMode === 'approve' ? 'Approve Invoice' : 'Reject Invoice'}
          subtitle={`Invoice #${selected.invoiceNumber}`}
          onClose={closeSlide}
          width={600}
          footer={
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={closeSlide}
                className="glass-button text-sm"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitVerification}
                disabled={isSubmitting || (slideMode === 'reject' && !rejectReason)}
                className={`px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50 ${
                  slideMode === 'approve'
                    ? 'bg-[color:var(--status-success)] text-white'
                    : 'bg-[color:var(--status-error)] text-white'
                }`}
              >
                {isSubmitting
                  ? 'Submitting…'
                  : slideMode === 'approve'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            {/* Invoice details (read-only) */}
            <section>
              <h3 className="text-xs font-semibold text-[color:var(--text-tertiary)] uppercase tracking-wider mb-3">
                Invoice Details
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Invoice #</dt>
                  <dd className="font-mono">{selected.invoiceNumber}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Amount</dt>
                  <dd className="font-mono tabular-nums">
                    {selected.currency} {parseFloat(selected.faceValue).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Issue Date</dt>
                  <dd>{new Date(selected.issueDate).toLocaleDateString('en-GB')}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Due Date</dt>
                  <dd>{new Date(selected.dueDate).toLocaleDateString('en-GB')}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Seller</dt>
                  <dd>{selected.seller?.fullName ?? selected.sellerId}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Debtor</dt>
                  <dd>{selected.debtor?.companyName ?? selected.debtorId}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Recourse Type</dt>
                  <dd className="capitalize">{selected.recourseType.replace('_', ' ')}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--text-tertiary)] text-xs">Status</dt>
                  <dd className="capitalize">{selected.verificationStatus}</dd>
                </div>
              </dl>
            </section>

            {/* Verification checklist (approve mode only) */}
            {slideMode === 'approve' && (
              <section>
                <h3 className="text-xs font-semibold text-[color:var(--text-tertiary)] uppercase tracking-wider mb-3">
                  Verification Checklist
                </h3>
                <div className="space-y-2">
                  {CHECKLIST_ITEMS.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={checklist[item.id]}
                        onChange={(e) =>
                          setChecklist((prev) => ({ ...prev, [item.id]: e.target.checked }))
                        }
                        className="mt-0.5 w-4 h-4 accent-[color:var(--accent-primary)]"
                      />
                      <span className="text-sm text-[color:var(--text-secondary)] group-hover:text-[color:var(--text-primary)] transition-colors">
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {/* Rejection reason (reject mode only) */}
            {slideMode === 'reject' && (
              <section>
                <h3 className="text-xs font-semibold text-[color:var(--text-tertiary)] uppercase tracking-wider mb-3">
                  Rejection Reason <span className="text-[color:var(--status-error)]">*</span>
                </h3>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="glass-input w-full text-sm"
                >
                  {REJECT_REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </section>
            )}

            {/* Notes */}
            <section>
              <h3 className="text-xs font-semibold text-[color:var(--text-tertiary)] uppercase tracking-wider mb-3">
                Operator Notes{' '}
                {slideMode === 'approve' && (
                  <span className="text-[color:var(--text-tertiary)] normal-case font-normal">(optional)</span>
                )}
                {slideMode === 'reject' && (
                  <span className="text-[color:var(--text-tertiary)] normal-case font-normal">(recommended)</span>
                )}
              </h3>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  slideMode === 'approve'
                    ? 'Add any notes for the audit trail…'
                    : 'Describe why this invoice is being rejected (visible in audit log)…'
                }
                className="glass-input w-full text-sm resize-none"
              />
            </section>
          </div>
        </SlideOver>
      )}
    </div>
  );
}
