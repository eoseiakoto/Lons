'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Drawer } from '@/components/ui/drawer';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/utils';

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
      toast('success', `Application ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'escalated'} successfully`);
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast('error', err.message || `Failed to ${action} application`);
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
      toast('error', 'Rejection reason is required');
      return;
    }
    handleAction('reject', rejectReason);
    setRejectModalOpen(false);
    setRejectReason('');
  };

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Application Review" width="w-[560px]">
        {loading ? (
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded" />
            ))}
          </div>
        ) : !request ? (
          <div className="text-white/40 text-center py-8">Application not found</div>
        ) : (
          <div className="space-y-6">
            {/* Customer Summary */}
            <div className="glass p-4">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Customer</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-white/40 text-xs">Name</p>
                  <p className="text-white font-medium">{customer?.fullName || customer?.externalId || '-'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">KYC Level</p>
                  <p className="text-white">{customer?.kycLevel?.replace(/_/g, ' ') || '-'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Status</p>
                  <StatusBadge status={customer?.status || 'unknown'} />
                </div>
                <div>
                  <p className="text-white/40 text-xs">Phone</p>
                  <p className="text-white">{customer?.phonePrimary || '-'}</p>
                </div>
              </div>
            </div>

            {/* Request Details */}
            <div className="glass p-4">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Request Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-white/40 text-xs">Amount</p>
                  <p className="text-white font-medium">{formatMoney(request.requestedAmount, request.currency)}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Tenor</p>
                  <p className="text-white">{request.requestedTenorDays ? `${request.requestedTenorDays} days` : '-'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Product</p>
                  <p className="text-white">{product?.name || request.productId}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Channel</p>
                  <p className="text-white">{request.channel || '-'}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Submitted</p>
                  <p className="text-white">{formatDate(request.createdAt)}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs">Status</p>
                  <StatusBadge status={request.status} />
                </div>
              </div>
            </div>

            {/* Scoring Breakdown */}
            {scoring && (
              <div className="glass p-4">
                <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Scoring Breakdown</h3>
                <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                  <div className="text-center">
                    <p className="text-white/40 text-xs">Score</p>
                    <p className="text-2xl font-bold text-white">{scoring.score}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white/40 text-xs">Risk Tier</p>
                    <StatusBadge status={scoring.riskTier} />
                  </div>
                  <div className="text-center">
                    <p className="text-white/40 text-xs">Recommendation</p>
                    <StatusBadge status={scoring.recommendation} />
                  </div>
                </div>
                {scoring.factors && scoring.factors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-white/40 uppercase">Factors</p>
                    {scoring.factors.map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-white/60">{f.name}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-white/10 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-blue-400"
                              style={{ width: `${Math.min((f.score / 100) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-white text-xs w-8 text-right">{f.score}</span>
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
                  Approve
                </button>
                <button
                  onClick={() => setRejectModalOpen(true)}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-all disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction('escalate')}
                  disabled={processing}
                  className="flex-1 glass-button text-sm py-2.5 disabled:opacity-50"
                >
                  Escalate
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Approve Modal with term modification */}
      <Modal open={approveModalOpen} onClose={() => setApproveModalOpen(false)} title="Approve Application" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-white/60">Optionally modify the terms before approving.</p>
          <div>
            <label className="block text-xs text-white/40 uppercase mb-1">Modified Amount (optional)</label>
            <input
              type="text"
              value={modifiedAmount}
              onChange={(e) => setModifiedAmount(e.target.value)}
              placeholder={request?.requestedAmount || ''}
              className="glass-input text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 uppercase mb-1">Modified Tenor Days (optional)</label>
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
              Cancel
            </button>
            <button onClick={handleApprove} disabled={processing} className="flex-1 glass-button-primary text-sm disabled:opacity-50">
              {processing ? 'Processing...' : 'Confirm Approval'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title="Reject Application" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/40 uppercase mb-1">Reason (required)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="glass-input text-sm w-full resize-none"
              placeholder="Enter the reason for rejection..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setRejectModalOpen(false); setRejectReason(''); }} className="flex-1 glass-button text-sm">
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={processing || !rejectReason.trim()}
              className="flex-1 px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-all disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
