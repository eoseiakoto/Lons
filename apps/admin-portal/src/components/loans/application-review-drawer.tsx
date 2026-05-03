'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Drawer } from '@/components/ui/drawer';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const LOAN_REQUEST_DETAIL_QUERY = gql`
  query LoanRequestDetail($id: ID!) {
    loanRequest(id: $id) {
      id customerId productId requestedAmount currency
      requestedTenorDays channel status
      scoringResult { score riskTier recommendation factors { name score weight } }
      customer { id fullName externalId phonePrimary kycLevel status }
      product { id name productType }
      createdAt updatedAt
    }
  }
`;

const PROCESS_LOAN_REQUEST = gql`
  mutation ProcessLoanRequest($id: ID!, $action: String!, $reason: String, $modifiedTerms: JSON) {
    processLoanRequest(id: $id, action: $action, reason: $reason, modifiedTerms: $modifiedTerms) {
      id status
    }
  }
`;

interface ApplicationReviewDrawerProps {
  open: boolean;
  onClose: () => void;
  requestId: string | null;
  onActionComplete?: () => void;
}

export function ApplicationReviewDrawer({ open, onClose, requestId, onActionComplete }: ApplicationReviewDrawerProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [modifiedTenor, setModifiedTenor] = useState('');
  const [modifiedAmount, setModifiedAmount] = useState('');

  const { data, loading } = useQuery(LOAN_REQUEST_DETAIL_QUERY, {
    variables: { id: requestId },
    skip: !requestId,
  });

  const [processRequest, { loading: processing }] = useMutation(PROCESS_LOAN_REQUEST);

  const request = data?.loanRequest;
  const customer = request?.customer;
  const product = request?.product;
  const scoring = request?.scoringResult;

  const handleAction = async (action: string, reason?: string, modifiedTerms?: any) => {
    if (!requestId) return;
    try {
      await processRequest({
        variables: { id: requestId, action, reason, modifiedTerms },
      });
      toast('success', t(`loans.review.success.${action}`));
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast('error', err.message || t('loans.review.error.actionFailed', { action: t(`loans.review.actions.${action}`) }));
    }
  };

  const handleApprove = () => {
    const terms: any = {};
    if (modifiedTenor) terms.tenorDays = parseInt(modifiedTenor);
    if (modifiedAmount) terms.amount = modifiedAmount;
    handleAction('approve', undefined, Object.keys(terms).length > 0 ? terms : undefined);
    setApproveModalOpen(false);
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast('error', t('loans.review.error.rejectionReasonRequired'));
      return;
    }
    handleAction('reject', rejectReason);
    setRejectModalOpen(false);
    setRejectReason('');
  };

  return (
    <>
      <Drawer open={open} onClose={onClose} title={t('loans.review.drawerTitle')} width="w-[560px]">
        {loading ? (
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-[color:var(--bg-muted)] rounded" />
            ))}
          </div>
        ) : !request ? (
          <div className="text-[color:var(--text-tertiary)] text-center py-8">{t('loans.review.notFound')}</div>
        ) : (
          <div className="space-y-6">
            {/* Customer Summary */}
            <div className="card p-4">
              <h3 className="section-label mb-3">{t('loans.review.section.customer')}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('common.name')}</p>
                  <p className="text-[color:var(--text-primary)] font-medium">{customer?.fullName || customer?.externalId || '-'}</p>
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.kycLevel')}</p>
                  <p className="text-[color:var(--text-primary)]">{customer?.kycLevel?.replace(/_/g, ' ') || '-'}</p>
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('common.status')}</p>
                  <StatusBadge status={customer?.status || 'unknown'} />
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('common.phone')}</p>
                  <p className="text-[color:var(--text-primary)]">{customer?.phonePrimary || '-'}</p>
                </div>
              </div>
            </div>

            {/* Request Details */}
            <div className="card p-4">
              <h3 className="section-label mb-3">{t('loans.review.section.requestDetails')}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('common.amount')}</p>
                  <p className="text-[color:var(--text-primary)] font-medium tabular-nums">{formatMoney(request.requestedAmount, request.currency)}</p>
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.tenor')}</p>
                  <p className="text-[color:var(--text-primary)]">{request.requestedTenorDays ? `${request.requestedTenorDays} ${t('common.days')}` : '-'}</p>
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.product')}</p>
                  <p className="text-[color:var(--text-primary)]">{product?.name || request.productId}</p>
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.channel')}</p>
                  <p className="text-[color:var(--text-primary)]">{request.channel || '-'}</p>
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.submitted')}</p>
                  <p className="text-[color:var(--text-primary)]">{formatDate(request.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[color:var(--text-tertiary)] text-xs">{t('common.status')}</p>
                  <StatusBadge status={request.status} />
                </div>
              </div>
            </div>

            {/* Scoring Breakdown */}
            {scoring && (
              <div className="card p-4">
                <h3 className="section-label mb-3">{t('loans.review.section.scoringBreakdown')}</h3>
                <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                  <div className="text-center">
                    <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.score')}</p>
                    <p className="kpi-value">{scoring.score}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.riskTier')}</p>
                    <StatusBadge status={scoring.riskTier} />
                  </div>
                  <div className="text-center">
                    <p className="text-[color:var(--text-tertiary)] text-xs">{t('loans.review.label.recommendation')}</p>
                    <StatusBadge status={scoring.recommendation} />
                  </div>
                </div>
                {scoring.factors && scoring.factors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[color:var(--text-tertiary)] uppercase">{t('loans.review.label.factors')}</p>
                    {scoring.factors.map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-[color:var(--text-secondary)]">{f.name}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-[color:var(--bg-muted)] rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-[color:var(--accent-primary)]"
                              style={{ width: `${Math.min((f.score / 100) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-[color:var(--text-primary)] text-xs w-8 text-right">{f.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {request.status === 'manual_review' && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setApproveModalOpen(true)}
                  disabled={processing}
                  className="flex-1 glass-button-primary text-sm py-2.5 disabled:opacity-50"
                >
                  {t('loans.review.button.approve')}
                </button>
                <button
                  onClick={() => setRejectModalOpen(true)}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50"
                >
                  {t('loans.review.button.reject')}
                </button>
                <button
                  onClick={() => handleAction('escalate')}
                  disabled={processing}
                  className="flex-1 glass-button text-sm py-2.5 disabled:opacity-50"
                >
                  {t('loans.review.button.escalate')}
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Approve Modal with term modification */}
      <Modal open={approveModalOpen} onClose={() => setApproveModalOpen(false)} title={t('loans.review.modal.approveTitle')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[color:var(--text-secondary)]">{t('loans.review.modal.approveDescription')}</p>
          <div>
            <label className="block text-xs text-[color:var(--text-tertiary)] uppercase mb-1">{t('loans.review.modal.modifiedAmount')}</label>
            <input
              type="text"
              value={modifiedAmount}
              onChange={(e) => setModifiedAmount(e.target.value)}
              placeholder={request?.requestedAmount || ''}
              className="glass-input text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-[color:var(--text-tertiary)] uppercase mb-1">{t('loans.review.modal.modifiedTenor')}</label>
            <input
              type="number"
              value={modifiedTenor}
              onChange={(e) => setModifiedTenor(e.target.value)}
              placeholder={request?.requestedTenorDays?.toString() || ''}
              className="glass-input text-sm w-full"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setApproveModalOpen(false)} className="flex-1 glass-button text-sm">
              {t('common.cancel')}
            </button>
            <button onClick={handleApprove} disabled={processing} className="flex-1 glass-button-primary text-sm disabled:opacity-50">
              {processing ? t('common.processing') : t('loans.review.modal.confirmApproval')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title={t('loans.review.modal.rejectTitle')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[color:var(--text-tertiary)] uppercase mb-1">{t('loans.review.modal.reasonRequired')}</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="glass-input text-sm w-full resize-none"
              placeholder={t('loans.review.modal.rejectionPlaceholder')}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setRejectModalOpen(false); setRejectReason(''); }} className="flex-1 glass-button text-sm">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleReject}
              disabled={processing || !rejectReason.trim()}
              className="flex-1 px-4 py-2 bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50"
            >
              {processing ? t('common.processing') : t('loans.review.modal.confirmRejection')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
