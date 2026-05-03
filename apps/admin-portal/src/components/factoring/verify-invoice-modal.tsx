'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { RESOLVE_INVOICE_VERIFICATION_MUTATION } from '@/lib/graphql/factoring';

interface VerifyInvoiceModalProps {
  invoiceId: string;
  open: boolean;
  /** Whether the operator is approving (true) or rejecting (false). */
  approving: boolean;
  onClose: () => void;
  onResolved: () => void;
}

/**
 * Approve / reject an invoice's verification step. Operators can attach
 * free-text notes (mandatory on rejection so the audit trail captures why).
 */
export function VerifyInvoiceModal({
  invoiceId,
  open,
  approving,
  onClose,
  onResolved,
}: VerifyInvoiceModalProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resolveVerification, { loading }] = useMutation(
    RESOLVE_INVOICE_VERIFICATION_MUTATION,
  );

  const handleSubmit = async () => {
    setError(null);
    if (!approving && !notes.trim()) {
      setError(t('factoring.verify.error.notesRequired'));
      return;
    }
    try {
      await resolveVerification({
        variables: {
          invoiceId,
          approved: approving,
          idempotencyKey: `verify-invoice-${invoiceId}-${Date.now()}`,
          notes: notes.trim() || null,
        },
      });
      toast(
        'success',
        approving
          ? t('factoring.verify.toastApproved')
          : t('factoring.verify.toastRejected'),
      );
      setNotes('');
      onResolved();
      onClose();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || t('factoring.verify.errorGeneric'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        approving
          ? t('factoring.verify.titleApprove')
          : t('factoring.verify.titleReject')
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[color:var(--text-secondary)]">
          {approving
            ? t('factoring.verify.descriptionApprove')
            : t('factoring.verify.descriptionReject')}
        </p>
        <div>
          <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">
            {approving
              ? t('factoring.verify.notesLabelOptional')
              : t('factoring.verify.notesLabelRequired')}
          </label>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="glass-input w-full text-sm resize-none"
            placeholder={t('factoring.verify.notesPlaceholder')}
          />
        </div>
        {error && (
          <p className="text-xs text-[color:var(--status-error-text)]">{error}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="glass-button text-sm"
            disabled={loading}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50 ${
              approving
                ? 'bg-[color:var(--status-success)] text-white'
                : 'bg-[color:var(--status-error)] text-white'
            }`}
          >
            {loading
              ? t('common.processing')
              : approving
                ? t('factoring.verify.confirmApprove')
                : t('factoring.verify.confirmReject')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
