'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import {
  CheckCircle2,
  XCircle,
  FileText,
  Send,
  Wallet,
  PiggyBank,
  AlertTriangle,
} from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import {
  ACCEPT_INVOICE_OFFER_MUTATION,
  DECLINE_INVOICE_OFFER_MUTATION,
  DISBURSE_INVOICE_ADVANCE_MUTATION,
  DISPUTE_INVOICE_MUTATION,
  NOTIFY_INVOICE_DEBTOR_MUTATION,
  RELEASE_INVOICE_RESERVE_MUTATION,
  type IInvoice,
} from '@/lib/graphql/factoring';
import { VerifyInvoiceModal } from './verify-invoice-modal';
import { GenerateOfferDrawer } from './generate-offer-drawer';
import { RecordPaymentModal } from './record-payment-modal';

interface InvoiceDetailActionsProps {
  invoice: IInvoice;
  onChanged: () => void;
}

/**
 * Status-driven action panel for an invoice. Each status surfaces only the
 * legitimate next-step actions; "Dispute" is always available while the
 * invoice is in an active (non-terminal) state.
 */
export function InvoiceDetailActions({
  invoice,
  onChanged,
}: InvoiceDetailActionsProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [verifyOpen, setVerifyOpen] = useState<{ open: boolean; approving: boolean }>({
    open: false,
    approving: true,
  });
  const [offerOpen, setOfferOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeError, setDisputeError] = useState<string | null>(null);

  const [acceptOffer, { loading: accepting }] = useMutation(
    ACCEPT_INVOICE_OFFER_MUTATION,
  );
  const [declineOffer, { loading: declining }] = useMutation(
    DECLINE_INVOICE_OFFER_MUTATION,
  );
  const [disburseAdvance, { loading: disbursing }] = useMutation(
    DISBURSE_INVOICE_ADVANCE_MUTATION,
  );
  const [notifyDebtor, { loading: notifying }] = useMutation(
    NOTIFY_INVOICE_DEBTOR_MUTATION,
  );
  const [releaseReserve, { loading: releasing }] = useMutation(
    RELEASE_INVOICE_RESERVE_MUTATION,
  );
  const [disputeInvoice, { loading: disputing }] = useMutation(
    DISPUTE_INVOICE_MUTATION,
  );

  const runMutation = async (
    fn: () => Promise<unknown>,
    successKey: string,
    fallbackErrorKey: string,
  ) => {
    try {
      await fn();
      toast('success', t(successKey));
      onChanged();
    } catch (err) {
      const e = err as { message?: string };
      toast('error', e.message || t(fallbackErrorKey));
    }
  };

  const handleAccept = () =>
    runMutation(
      () =>
        acceptOffer({
          variables: {
            invoiceId: invoice.id,
            idempotencyKey: `accept-offer-${invoice.id}-${Date.now()}`,
          },
        }),
      'factoring.offer.toastAccepted',
      'factoring.offer.errorAccept',
    );

  const handleDecline = () =>
    runMutation(
      () =>
        declineOffer({
          variables: {
            invoiceId: invoice.id,
            idempotencyKey: `decline-offer-${invoice.id}-${Date.now()}`,
            reason: null,
          },
        }),
      'factoring.offer.toastDeclined',
      'factoring.offer.errorDecline',
    );

  const handleDisburse = () =>
    runMutation(
      () =>
        disburseAdvance({
          variables: {
            invoiceId: invoice.id,
            idempotencyKey: `disburse-${invoice.id}-${Date.now()}`,
          },
        }),
      'factoring.disburse.toast',
      'factoring.disburse.error',
    );

  const handleNotify = () =>
    runMutation(
      () =>
        notifyDebtor({
          variables: {
            invoiceId: invoice.id,
            idempotencyKey: `notify-${invoice.id}-${Date.now()}`,
          },
        }),
      'factoring.notify.toast',
      'factoring.notify.error',
    );

  const handleRelease = () =>
    runMutation(
      () =>
        releaseReserve({
          variables: {
            invoiceId: invoice.id,
            idempotencyKey: `release-${invoice.id}-${Date.now()}`,
          },
        }),
      'factoring.reserve.toast',
      'factoring.reserve.error',
    );

  const handleDispute = async () => {
    setDisputeError(null);
    if (!disputeReason.trim()) {
      setDisputeError(t('factoring.dispute.error.reasonRequired'));
      return;
    }
    try {
      await disputeInvoice({
        variables: {
          invoiceId: invoice.id,
          reason: disputeReason.trim(),
          idempotencyKey: `dispute-${invoice.id}-${Date.now()}`,
        },
      });
      toast('success', t('factoring.dispute.toast'));
      setDisputeReason('');
      setDisputeOpen(false);
      onChanged();
    } catch (err) {
      const e = err as { message?: string };
      setDisputeError(e.message || t('factoring.dispute.error.generic'));
    }
  };

  const isTerminal = ['settled', 'cancelled', 'rejected', 'defaulted'].includes(
    invoice.status,
  );

  return (
    <div className="card-glow p-6 space-y-4">
      <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
        {t('factoring.actions.panelTitle')}
      </h3>

      <div className="flex flex-wrap gap-2">
        {invoice.status === 'under_review' && (
          <>
            <button
              type="button"
              onClick={() => setVerifyOpen({ open: true, approving: true })}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              {t('factoring.actions.approve')}
            </button>
            <button
              type="button"
              onClick={() => setVerifyOpen({ open: true, approving: false })}
              className="px-4 py-2 rounded-lg text-sm bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] hover:opacity-80 transition-all inline-flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              {t('factoring.actions.reject')}
            </button>
          </>
        )}

        {invoice.status === 'verified' && (
          <button
            type="button"
            onClick={() => setOfferOpen(true)}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            {t('factoring.actions.generateOffer')}
          </button>
        )}

        {invoice.status === 'offer_generated' && (
          <>
            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting}
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {accepting
                ? t('common.processing')
                : t('factoring.actions.acceptOffer')}
            </button>
            <button
              type="button"
              onClick={handleDecline}
              disabled={declining}
              className="px-4 py-2 rounded-lg text-sm bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] hover:opacity-80 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              {declining
                ? t('common.processing')
                : t('factoring.actions.declineOffer')}
            </button>
          </>
        )}

        {invoice.status === 'offer_accepted' && (
          <button
            type="button"
            onClick={handleDisburse}
            disabled={disbursing}
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Wallet className="w-4 h-4" />
            {disbursing
              ? t('common.processing')
              : t('factoring.actions.disburseAdvance')}
          </button>
        )}

        {invoice.status === 'funded' && (
          <button
            type="button"
            onClick={handleNotify}
            disabled={notifying}
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {notifying
              ? t('common.processing')
              : t('factoring.actions.notifyDebtor')}
          </button>
        )}

        {invoice.status === 'debtor_notified' && (
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <PiggyBank className="w-4 h-4" />
            {t('factoring.actions.recordPayment')}
          </button>
        )}

        {invoice.status === 'payment_received' && (
          <button
            type="button"
            onClick={handleRelease}
            disabled={releasing}
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <PiggyBank className="w-4 h-4" />
            {releasing
              ? t('common.processing')
              : t('factoring.actions.releaseReserve')}
          </button>
        )}

        {invoice.status === 'reserve_released' && (
          <span className="text-[12px] text-[color:var(--status-success-text)] inline-flex items-center gap-1.5 px-3 py-2">
            <CheckCircle2 className="w-4 h-4" />
            {t('factoring.actions.reserveReleased')}
          </span>
        )}

        {!isTerminal && (
          <button
            type="button"
            onClick={() => {
              setDisputeReason('');
              setDisputeError(null);
              setDisputeOpen(true);
            }}
            className="ml-auto px-4 py-2 rounded-lg text-sm bg-[color:var(--status-warning-soft)] border border-[color:var(--status-warning)] text-[color:var(--status-warning-text)] hover:opacity-80 transition-all inline-flex items-center gap-1.5"
          >
            <AlertTriangle className="w-4 h-4" />
            {t('factoring.actions.dispute')}
          </button>
        )}
      </div>

      <VerifyInvoiceModal
        invoiceId={invoice.id}
        open={verifyOpen.open}
        approving={verifyOpen.approving}
        onClose={() => setVerifyOpen((s) => ({ ...s, open: false }))}
        onResolved={onChanged}
      />

      <GenerateOfferDrawer
        invoiceId={invoice.id}
        open={offerOpen}
        defaultRecourseType={invoice.recourseType}
        onClose={() => setOfferOpen(false)}
        onResolved={onChanged}
      />

      <RecordPaymentModal
        invoiceId={invoice.id}
        faceValue={invoice.faceValue}
        currency={invoice.currency}
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onResolved={onChanged}
      />

      <Modal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        title={t('factoring.dispute.title')}
      >
        <div className="space-y-4">
          <p className="text-sm text-[color:var(--text-secondary)]">
            {t('factoring.dispute.description')}
          </p>
          <div>
            <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">
              {t('factoring.dispute.reasonLabel')}
            </label>
            <textarea
              rows={3}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder={t('factoring.dispute.reasonPlaceholder')}
              className="glass-input w-full text-sm resize-none"
            />
          </div>
          {disputeError && (
            <p className="text-xs text-[color:var(--status-error-text)]">{disputeError}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDisputeOpen(false)}
              className="glass-button text-sm"
              disabled={disputing}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleDispute}
              disabled={disputing}
              className="px-4 py-2 rounded-lg text-sm bg-[color:var(--status-warning-soft)] border border-[color:var(--status-warning)] text-[color:var(--status-warning-text)] hover:opacity-80 transition-all disabled:opacity-50"
            >
              {disputing
                ? t('common.processing')
                : t('factoring.dispute.confirm')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
