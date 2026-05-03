'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@apollo/client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { Drawer } from '@/components/ui/drawer';
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils';
import {
  ACCEPT_INVOICE_OFFER_MUTATION,
  DECLINE_INVOICE_OFFER_MUTATION,
  GENERATE_INVOICE_OFFER_MUTATION,
  type IInvoiceOffer,
  type RecourseType,
} from '@/lib/graphql/factoring';

interface GenerateOfferDrawerProps {
  invoiceId: string;
  open: boolean;
  /** Optional override — when set, the operator can request a different recourse type. */
  defaultRecourseType?: RecourseType;
  onClose: () => void;
  onResolved: () => void;
}

/**
 * Two-stage flow:
 *  1. Operator opens the drawer → optionally chooses the recourse type → clicks
 *     "Generate Offer", which calls `generateInvoiceOffer`.
 *  2. The drawer renders the proposed financial terms with Accept / Decline
 *     buttons (operator override path; the seller normally accepts via REST).
 */
export function GenerateOfferDrawer({
  invoiceId,
  open,
  defaultRecourseType = 'with_recourse',
  onClose,
  onResolved,
}: GenerateOfferDrawerProps) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [recourseType, setRecourseType] = useState<RecourseType>(defaultRecourseType);
  const [offer, setOffer] = useState<IInvoiceOffer | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [generateOffer, { loading: generating }] = useMutation(
    GENERATE_INVOICE_OFFER_MUTATION,
  );
  const [acceptOffer, { loading: accepting }] = useMutation(
    ACCEPT_INVOICE_OFFER_MUTATION,
  );
  const [declineOffer, { loading: declining }] = useMutation(
    DECLINE_INVOICE_OFFER_MUTATION,
  );

  useEffect(() => {
    if (!open) {
      setOffer(null);
      setDeclineReason('');
      setError(null);
      setRecourseType(defaultRecourseType);
    }
  }, [open, defaultRecourseType]);

  const handleGenerate = async () => {
    setError(null);
    try {
      const result = await generateOffer({
        variables: {
          invoiceId,
          idempotencyKey: `gen-offer-${invoiceId}-${Date.now()}`,
          requestedRecourseType: recourseType,
        },
      });
      setOffer(result.data?.generateInvoiceOffer ?? null);
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || t('factoring.offer.errorGenerate'));
    }
  };

  const handleAccept = async () => {
    setError(null);
    try {
      await acceptOffer({
        variables: {
          invoiceId,
          idempotencyKey: `accept-offer-${invoiceId}-${Date.now()}`,
        },
      });
      toast('success', t('factoring.offer.toastAccepted'));
      onResolved();
      onClose();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || t('factoring.offer.errorAccept'));
    }
  };

  const handleDecline = async () => {
    setError(null);
    try {
      await declineOffer({
        variables: {
          invoiceId,
          idempotencyKey: `decline-offer-${invoiceId}-${Date.now()}`,
          reason: declineReason.trim() || null,
        },
      });
      toast('success', t('factoring.offer.toastDeclined'));
      onResolved();
      onClose();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || t('factoring.offer.errorDecline'));
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={t('factoring.offer.drawerTitle')}>
      <div className="space-y-6">
        {!offer ? (
          <>
            <p className="text-sm text-[color:var(--text-secondary)]">
              {t('factoring.offer.descriptionGenerate')}
            </p>
            <div>
              <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
                {t('factoring.offer.recourseTypeLabel')}
              </label>
              <select
                value={recourseType}
                onChange={(e) =>
                  setRecourseType(e.target.value as RecourseType)
                }
                className="glass-input w-full text-sm"
              >
                <option value="with_recourse">
                  {t('factoring.offer.recourseWith')}
                </option>
                <option value="without_recourse">
                  {t('factoring.offer.recourseWithout')}
                </option>
              </select>
              <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
                {t('factoring.offer.recourseHint')}
              </p>
            </div>
            {error && (
              <p className="text-xs text-[color:var(--status-error-text)]">{error}</p>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={onClose}
                className="glass-button text-sm"
                disabled={generating}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary disabled:opacity-50"
              >
                {generating
                  ? t('common.processing')
                  : t('factoring.offer.confirmGenerate')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="card p-4 space-y-3">
              <h3 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
                {t('factoring.offer.financialTerms')}
              </h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <OfferRow
                  label={t('factoring.detail.faceValue')}
                  value={formatMoney(offer.faceValue, offer.currency)}
                />
                <OfferRow
                  label={t('factoring.detail.advanceRate')}
                  value={`${offer.advanceRatePercent}%`}
                />
                <OfferRow
                  label={t('factoring.detail.advancedAmount')}
                  value={formatMoney(offer.advancedAmount, offer.currency)}
                />
                <OfferRow
                  label={t('factoring.detail.reserveAmount')}
                  value={formatMoney(offer.reserveAmount, offer.currency)}
                />
                <OfferRow
                  label={t('factoring.detail.discountFee')}
                  value={formatMoney(offer.discountFee, offer.currency)}
                />
                <OfferRow
                  label={t('factoring.detail.serviceFee')}
                  value={formatMoney(offer.serviceFee, offer.currency)}
                />
                <OfferRow
                  label={t('factoring.detail.netDisbursement')}
                  value={formatMoney(offer.netDisbursement, offer.currency)}
                  emphasis
                />
                <OfferRow
                  label={t('factoring.detail.recourseType')}
                  value={
                    offer.recourseType === 'with_recourse'
                      ? t('factoring.offer.recourseWith')
                      : t('factoring.offer.recourseWithout')
                  }
                />
                <OfferRow
                  label={t('factoring.detail.dueDate')}
                  value={formatDate(offer.dueDate)}
                />
                {offer.expiresAt && (
                  <OfferRow
                    label={t('factoring.offer.expiresAt')}
                    value={formatDateTime(offer.expiresAt)}
                  />
                )}
              </dl>
            </div>

            <div>
              <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">
                {t('factoring.offer.declineReasonLabel')}
              </label>
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder={t('factoring.offer.declineReasonPlaceholder')}
                className="glass-input w-full text-sm"
              />
            </div>

            {error && (
              <p className="text-xs text-[color:var(--status-error-text)]">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={handleDecline}
                disabled={declining || accepting}
                className="px-4 py-2 rounded-lg text-sm bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] hover:opacity-80 transition-all disabled:opacity-50"
              >
                {declining
                  ? t('common.processing')
                  : t('factoring.offer.confirmDecline')}
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting || declining}
                className="btn-primary disabled:opacity-50"
              >
                {accepting
                  ? t('common.processing')
                  : t('factoring.offer.confirmAccept')}
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

function OfferRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-[color:var(--text-tertiary)] text-xs">{label}</dt>
      <dd
        className={`tabular-nums mt-0.5 ${
          emphasis
            ? 'text-[color:var(--accent-primary-deep)] font-semibold text-[15px]'
            : 'text-[color:var(--text-primary)] text-sm'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
