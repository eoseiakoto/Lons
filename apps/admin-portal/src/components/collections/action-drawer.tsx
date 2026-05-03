'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Drawer } from '@/components/ui/drawer';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
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
        toast('error', t('collections.action.error.selectCallOutcome'));
        return;
      }
      input.outcome = callOutcome;
    }

    if (actionType === 'ptp') {
      if (!ptpDate || !ptpAmount) {
        toast('error', t('collections.action.error.ptpRequired'));
        return;
      }
      input.ptpDate = ptpDate;
      input.ptpAmount = ptpAmount;
    }

    try {
      await logAction({ variables: { input } });
      const successKey = actionType === 'call' ? 'log_call' : actionType === 'ptp' ? 'record_ptp' : actionType === 'reminder' ? 'send_reminder' : 'escalate';
      toast('success', t(`collections.action.success.${successKey}`));
      resetForm();
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast('error', err.message || t('collections.action.error.failedToLog'));
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={t('collections.action.drawerTitle')} width="w-[520px]">
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-[color:var(--bg-muted)] rounded" />
          ))}
        </div>
      ) : !contract ? (
        <div className="text-[color:var(--text-tertiary)] text-center py-8">{t('collections.action.contractNotFound')}</div>
      ) : (
        <div className="space-y-6">
          {/* Contract Summary */}
          <div className="card p-4">
            <h3 className="section-label mb-3">{t('collections.action.contractSummary')}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('collections.action.label.contractNumber')}</p>
                <p className="text-[color:var(--text-primary)] font-medium">{contract.contractNumber}</p>
              </div>
              <div>
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('collections.action.label.customer')}</p>
                <p className="text-[color:var(--text-primary)]">{contract.customer?.fullName || contract.customer?.externalId || '-'}</p>
              </div>
              <div>
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('collections.action.label.outstanding')}</p>
                <p className="text-[color:var(--text-primary)] font-medium tabular-nums">{formatMoney(contract.totalOutstanding || '0', contract.currency)}</p>
              </div>
              <div>
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('collections.action.label.dpd')}</p>
                <p className={`font-mono font-bold ${contract.daysPastDue > 90 ? 'text-[color:var(--status-error-text)]' : 'text-[color:var(--status-warning-text)]'}`}>
                  {contract.daysPastDue}
                </p>
              </div>
              <div>
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('collections.action.label.classification')}</p>
                <StatusBadge status={contract.classification} />
              </div>
              <div>
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('collections.action.label.phone')}</p>
                <p className="text-[color:var(--text-primary)]">{contract.customer?.phonePrimary || '-'}</p>
              </div>
            </div>
          </div>

          {/* Action History Timeline */}
          {history.length > 0 && (
            <div className="card p-4">
              <h3 className="section-label mb-3">{t('collections.action.actionHistory')}</h3>
              <div className="relative max-h-48 overflow-y-auto">
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[color:var(--bg-muted)]" />
                <div className="space-y-4">
                  {history.map((entry: any) => (
                    <div key={entry.id} className="relative pl-6">
                      <div className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-[color:var(--accent-primary)] bg-slate-900" />
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={entry.actionType} />
                          {entry.outcome && <span className="text-xs text-[color:var(--text-tertiary)]">({entry.outcome})</span>}
                        </div>
                        {entry.notes && <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">{entry.notes}</p>}
                        {entry.ptpDate && (
                          <p className="text-xs text-[color:var(--status-warning-text)] mt-0.5 tabular-nums">
                            {t('collections.action.ptpPrefix')}{formatDate(entry.ptpDate)} - {formatMoney(String(entry.ptpAmount), contract.currency)}
                          </p>
                        )}
                        <p className="text-xs text-[color:var(--text-tertiary)] mt-0.5">
                          {formatDateTime(entry.createdAt)}
                          {entry.actor && t('collections.action.byActor', { actor: entry.actor })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action Form */}
          <div className="card p-4">
            <h3 className="section-label mb-3">{t('collections.action.logAction')}</h3>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {([
                { key: 'call', label: t('collections.action.button.logCall') },
                { key: 'ptp', label: t('collections.action.button.recordPtp') },
                { key: 'reminder', label: t('collections.action.button.sendReminder') },
                { key: 'escalate', label: t('collections.action.button.escalate') },
              ] as const).map((a) => (
                <button
                  key={a.key}
                  onClick={() => setActionType(a.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    actionType === a.key
                      ? 'bg-[color:var(--accent-primary-soft)] border-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)]'
                      : 'bg-[color:var(--bg-muted)] border-[color:var(--border-subtle)] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {actionType === 'call' && (
              <div className="mb-4">
                <label className="block text-xs text-[color:var(--text-tertiary)] uppercase mb-1">{t('collections.action.label.callOutcome')}</label>
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="glass-input text-sm w-full"
                >
                  <option value="">{t('collections.action.placeholder.selectOutcome')}</option>
                  <option value="answered_promise">{t('collections.action.outcome.answeredPromise')}</option>
                  <option value="answered_dispute">{t('collections.action.outcome.answeredDispute')}</option>
                  <option value="answered_hardship">{t('collections.action.outcome.answeredHardship')}</option>
                  <option value="no_answer">{t('collections.action.outcome.noAnswer')}</option>
                  <option value="wrong_number">{t('collections.action.outcome.wrongNumber')}</option>
                  <option value="disconnected">{t('collections.action.outcome.disconnected')}</option>
                </select>
              </div>
            )}

            {actionType === 'ptp' && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-[color:var(--text-tertiary)] uppercase mb-1">{t('collections.action.label.ptpDate')}</label>
                  <input
                    type="date"
                    value={ptpDate}
                    onChange={(e) => setPtpDate(e.target.value)}
                    className="glass-input text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[color:var(--text-tertiary)] uppercase mb-1">{t('collections.action.label.ptpAmount')}</label>
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
              <label className="block text-xs text-[color:var(--text-tertiary)] uppercase mb-1">{t('collections.action.label.notes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="glass-input text-sm w-full resize-none"
                placeholder={t('collections.action.placeholder.addNotes')}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full glass-button-primary text-sm py-2.5 disabled:opacity-50"
            >
              {submitting ? t('collections.action.button.submitting') : t('collections.action.button.submitAction')}
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
