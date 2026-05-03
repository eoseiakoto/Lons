'use client';

import { useState } from 'react';
import { useMutation } from '@apollo/client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { compare } from '@/lib/decimal';
import { RECORD_INVOICE_DEBTOR_PAYMENT_MUTATION } from '@/lib/graphql/factoring';

const DECIMAL_4DP_REGEX = /^\d+(\.\d{1,4})?$/;

interface RecordPaymentModalProps {
  invoiceId: string;
  /** Decimal-as-string. Used to seed and bound the payment amount. */
  faceValue: string;
  currency: string;
  open: boolean;
  onClose: () => void;
  onResolved: () => void;
}

/**
 * Record a debtor payment against a funded invoice. Decimal-string validation
 * for the amount; payment ref is required (the wallet/bank reference for the
 * incoming transfer).
 */
export function RecordPaymentModal({
  invoiceId,
  faceValue,
  currency,
  open,
  onClose,
  onResolved,
}: RecordPaymentModalProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recordPayment, { loading }] = useMutation(
    RECORD_INVOICE_DEBTOR_PAYMENT_MUTATION,
  );

  const handleSubmit = async () => {
    setError(null);
    const trimmedAmount = amount.trim();
    if (!DECIMAL_4DP_REGEX.test(trimmedAmount)) {
      setError(t('factoring.recordPayment.error.amountInvalid'));
      return;
    }
    if (compare(trimmedAmount, '0') <= 0) {
      setError(t('factoring.recordPayment.error.amountPositive'));
      return;
    }
    if (!paymentRef.trim()) {
      setError(t('factoring.recordPayment.error.paymentRefRequired'));
      return;
    }
    try {
      await recordPayment({
        variables: {
          invoiceId,
          input: {
            amountReceived: trimmedAmount,
            paymentRef: paymentRef.trim(),
            idempotencyKey: `record-payment-${invoiceId}-${Date.now()}`,
          },
        },
      });
      toast('success', t('factoring.recordPayment.toastRecorded'));
      setAmount('');
      setPaymentRef('');
      onResolved();
      onClose();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || t('factoring.recordPayment.errorGeneric'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('factoring.recordPayment.title')}
    >
      <div className="space-y-4">
        <p className="text-sm text-[color:var(--text-secondary)]">
          {t('factoring.recordPayment.description', {
            faceValue,
            currency,
          })}
        </p>
        <div>
          <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">
            {t('factoring.recordPayment.amountLabel', { currency })}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={faceValue}
            className="glass-input w-full text-sm tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">
            {t('factoring.recordPayment.paymentRefLabel')}
          </label>
          <input
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder={t('factoring.recordPayment.paymentRefPlaceholder')}
            className="glass-input w-full text-sm font-mono"
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
            className="btn-primary disabled:opacity-50"
          >
            {loading
              ? t('common.processing')
              : t('factoring.recordPayment.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
