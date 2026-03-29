'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Drawer } from '@/components/ui/drawer';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils';

const CONTRACT_COLLECTIONS_QUERY = gql`
  query ContractCollections($id: ID!) {
    contract(id: $id) {
      id contractNumber customerId currency
      principalAmount totalOutstanding daysPastDue
      status classification
      customer { id fullName externalId phonePrimary }
    }
    collectionsHistory(contractId: $id) {
      id actionType outcome notes ptpDate ptpAmount actor createdAt
    }
  }
`;

const LOG_ACTION = gql`
  mutation LogCollectionsAction($input: LogCollectionsActionInput!) {
    logCollectionsAction(input: $input) {
      id actionType
    }
  }
`;

interface CollectionsActionDrawerProps {
  open: boolean;
  onClose: () => void;
  contractId: string | null;
  onActionComplete?: () => void;
}

type ActionType = 'call' | 'ptp' | 'reminder' | 'escalate';

export function CollectionsActionDrawer({ open, onClose, contractId, onActionComplete }: CollectionsActionDrawerProps) {
  const { toast } = useToast();
  const [actionType, setActionType] = useState<ActionType>('call');
  const [callOutcome, setCallOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [ptpDate, setPtpDate] = useState('');
  const [ptpAmount, setPtpAmount] = useState('');

  const { data, loading } = useQuery(CONTRACT_COLLECTIONS_QUERY, {
    variables: { id: contractId },
    skip: !contractId,
  });

  const [logAction, { loading: submitting }] = useMutation(LOG_ACTION);

  const contract = data?.contract;
  const history = data?.collectionsHistory || [];

  const resetForm = () => {
    setCallOutcome('');
    setNotes('');
    setPtpDate('');
    setPtpAmount('');
  };

  const handleSubmit = async () => {
    if (!contractId) return;

    const input: any = {
      contractId,
      actionType,
      notes,
    };

    if (actionType === 'call') {
      if (!callOutcome) {
        toast('error', 'Please select a call outcome');
        return;
      }
      input.outcome = callOutcome;
    }

    if (actionType === 'ptp') {
      if (!ptpDate || !ptpAmount) {
        toast('error', 'PTP date and amount are required');
        return;
      }
      input.ptpDate = ptpDate;
      input.ptpAmount = ptpAmount;
    }

    try {
      await logAction({ variables: { input } });
      toast('success', `${actionType === 'call' ? 'Call logged' : actionType === 'ptp' ? 'PTP recorded' : actionType === 'reminder' ? 'Reminder sent' : 'Escalated'} successfully`);
      resetForm();
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast('error', err.message || 'Failed to log action');
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Collections Action" width="w-[520px]">
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded" />
          ))}
        </div>
      ) : !contract ? (
        <div className="text-white/40 text-center py-8">Contract not found</div>
      ) : (
        <div className="space-y-6">
          {/* Contract Summary */}
          <div className="glass p-4">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Contract Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-white/40 text-xs">Contract #</p>
                <p className="text-white font-medium">{contract.contractNumber}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Customer</p>
                <p className="text-white">{contract.customer?.fullName || contract.customer?.externalId || '-'}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Outstanding</p>
                <p className="text-white font-medium">{formatMoney(contract.totalOutstanding || '0', contract.currency)}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">DPD</p>
                <p className={`font-mono font-bold ${contract.daysPastDue > 90 ? 'text-red-400' : 'text-orange-400'}`}>
                  {contract.daysPastDue}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Classification</p>
                <StatusBadge status={contract.classification} />
              </div>
              <div>
                <p className="text-white/40 text-xs">Phone</p>
                <p className="text-white">{contract.customer?.phonePrimary || '-'}</p>
              </div>
            </div>
          </div>

          {/* Action History Timeline */}
          {history.length > 0 && (
            <div className="glass p-4">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Action History</h3>
              <div className="relative max-h-48 overflow-y-auto">
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />
                <div className="space-y-4">
                  {history.map((entry: any) => (
                    <div key={entry.id} className="relative pl-6">
                      <div className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-blue-400 bg-slate-900" />
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={entry.actionType} />
                          {entry.outcome && <span className="text-xs text-white/40">({entry.outcome})</span>}
                        </div>
                        {entry.notes && <p className="text-xs text-white/50 mt-0.5">{entry.notes}</p>}
                        {entry.ptpDate && (
                          <p className="text-xs text-amber-400 mt-0.5">
                            PTP: {formatDate(entry.ptpDate)} - {formatMoney(String(entry.ptpAmount), contract.currency)}
                          </p>
                        )}
                        <p className="text-xs text-white/20 mt-0.5">
                          {formatDateTime(entry.createdAt)}
                          {entry.actor && ` by ${entry.actor}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action Form */}
          <div className="glass p-4">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Log Action</h3>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {([
                { key: 'call', label: 'Log Call' },
                { key: 'ptp', label: 'Record PTP' },
                { key: 'reminder', label: 'Send Reminder' },
                { key: 'escalate', label: 'Escalate' },
              ] as const).map((a) => (
                <button
                  key={a.key}
                  onClick={() => setActionType(a.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    actionType === a.key
                      ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {actionType === 'call' && (
              <div className="mb-4">
                <label className="block text-xs text-white/40 uppercase mb-1">Call Outcome</label>
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="glass-input text-sm w-full"
                >
                  <option value="">Select outcome...</option>
                  <option value="answered_promise">Answered - Promise to Pay</option>
                  <option value="answered_dispute">Answered - Dispute</option>
                  <option value="answered_hardship">Answered - Financial Hardship</option>
                  <option value="no_answer">No Answer</option>
                  <option value="wrong_number">Wrong Number</option>
                  <option value="disconnected">Disconnected</option>
                </select>
              </div>
            )}

            {actionType === 'ptp' && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-white/40 uppercase mb-1">PTP Date</label>
                  <input
                    type="date"
                    value={ptpDate}
                    onChange={(e) => setPtpDate(e.target.value)}
                    className="glass-input text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 uppercase mb-1">PTP Amount</label>
                  <input
                    type="text"
                    value={ptpAmount}
                    onChange={(e) => setPtpAmount(e.target.value)}
                    placeholder="0.00"
                    className="glass-input text-sm w-full"
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs text-white/40 uppercase mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="glass-input text-sm w-full resize-none"
                placeholder="Add notes..."
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full glass-button-primary text-sm py-2.5 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Action'}
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
