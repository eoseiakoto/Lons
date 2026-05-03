'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Clock, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Drawer } from '@/components/ui/drawer';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';
import { FactoringDefaultsTable } from '@/components/collections/factoring-defaults-table';

const COLLECTIONS_QUERY = gql`
  query Collections($sortBy: String, $take: Int, $cursor: String) {
    collectionsMetrics {
      overdueCount delinquentCount defaultCount totalInCollections totalActions
    }
    collectionsQueue(sortBy: $sortBy, take: $take, cursor: $cursor) {
      items {
        id contractNumber principalAmount totalOutstanding currency
        daysPastDue status classification startDate maturityDate
        customer { id fullName phonePrimary }
        product { id name }
        collectionsActions { id actionType notes createdAt }
      }
      hasMore
    }
  }
`;

const COLLECTIONS_ACTIONS = gql`
  query CollectionsActions($contractId: ID!) {
    collectionsActions(contractId: $contractId) {
      id actionType notes actorId promiseDate createdAt
    }
  }
`;

const LOG_ACTION = gql`
  mutation LogAction($contractId: ID!, $actionType: String!, $notes: String!, $promiseDate: String) {
    logCollectionsAction(contractId: $contractId, actionType: $actionType, notes: $notes, promiseDate: $promiseDate) {
      id actionType notes createdAt
    }
  }
`;

interface QueueItem {
  id: string;
  contractNumber: string;
  principalAmount: string;
  totalOutstanding?: string;
  currency: string;
  daysPastDue: number;
  status: string;
  classification: string;
  startDate: string;
  maturityDate: string;
  customer?: { id: string; fullName?: string; phonePrimary?: string };
  product?: { id: string; name: string };
  collectionsActions?: { id: string; actionType: string; notes?: string; createdAt: string }[];
}

interface ActionNode {
  id: string;
  actionType: string;
  notes?: string;
  actorId?: string;
  promiseDate?: string;
  createdAt: string;
}

const ACTION_TYPES = [
  'phone_call', 'sms_reminder', 'email_reminder', 'field_visit',
  'promise_to_pay', 'payment_arrangement', 'escalation', 'legal_notice',
];

function formatCurrency(amount: string | undefined, currency: string) {
  if (!amount) return '-';
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dpdBadge(dpd: number) {
  const cls = dpd > 90 ? 'pill pill-error' :
    dpd > 30 ? 'pill pill-warning' :
    'pill pill-warning';
  return <span className={cls}>{dpd}d</span>;
}

export default function CollectionsPage() {
  const { t } = useI18n();
  const [sortBy, setSortBy] = useState<'dpd' | 'amount'>('dpd');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [actionType, setActionType] = useState('phone_call');
  const [actionNotes, setActionNotes] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, loading, refetch } = useQuery(COLLECTIONS_QUERY, {
    variables: { sortBy, take: 50 },
  });

  const { data: actionsData, loading: actionsLoading } = useQuery(COLLECTIONS_ACTIONS, {
    variables: { contractId: selected?.id || '' },
    skip: !selected,
  });

  const [logAction, { loading: logging }] = useMutation(LOG_ACTION);

  const metrics = data?.collectionsMetrics;
  const queue: QueueItem[] = data?.collectionsQueue?.items || [];
  const actions: ActionNode[] = actionsData?.collectionsActions || [];

  const openDetail = (item: QueueItem) => {
    setSelected(item);
    setActionType('phone_call');
    setActionNotes('');
    setPromiseDate('');
    setActionError('');
    setDrawerOpen(true);
  };

  const handleLogAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !actionNotes.trim()) return;
    setActionError('');
    try {
      await logAction({
        variables: {
          contractId: selected.id,
          actionType,
          notes: actionNotes,
          promiseDate: promiseDate || null,
        },
      });
      setActionNotes('');
      setPromiseDate('');
      refetch();
    } catch (err: any) {
      setActionError(err?.graphQLErrors?.[0]?.message || 'Failed to log action');
    }
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.recoveryOperations')}
        title={t('collections.title')}
        subtitle={t('collections.pageSubtitle')}
      />

      {loading ? (
        <div className="text-sm text-[color:var(--text-tertiary)] py-12 text-center relative z-10">
          {t('common.loading')}
        </div>
      ) : (
        <>
          <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              variant="glow"
              title={t('collections.overdue')}
              value={metrics?.overdueCount ?? 0}
              icon={<Clock className="w-4 h-4" />}
              live={(metrics?.overdueCount ?? 0) > 0}
            />
            <MetricCard
              variant="glow"
              title={t('collections.delinquent')}
              value={metrics?.delinquentCount ?? 0}
              icon={<AlertTriangle className="w-4 h-4" />}
              live={(metrics?.delinquentCount ?? 0) > 0}
            />
            <MetricCard
              variant="glow"
              title={t('collections.default')}
              value={metrics?.defaultCount ?? 0}
              icon={<ShieldAlert className="w-4 h-4" />}
              live={(metrics?.defaultCount ?? 0) > 0}
            />
            <MetricCard
              variant="glow"
              title={t('collections.totalActions')}
              value={metrics?.totalActions ?? 0}
              icon={<Activity className="w-4 h-4" />}
            />
          </section>

          <section className="relative z-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[20px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                {t('collections.collectionsQueue')}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                  {t('common.sortBy')}
                </span>
                <FilterPill
                  options={[
                    { value: 'dpd', label: t('collections.daysPastDue') },
                    { value: 'amount', label: t('collections.outstandingAmount') },
                  ]}
                  value={sortBy}
                  onChange={(v) => setSortBy(v as 'dpd' | 'amount')}
                />
              </div>
            </div>

            <div className="card-glow overflow-hidden">
              {queue.length === 0 ? (
                <p className="text-sm text-[color:var(--text-tertiary)] py-8 text-center">{t('collections.noContracts')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-clean w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <th className="pb-3 pr-4 text-[13px] font-medium text-[color:var(--text-secondary)]">{t('collections.contract')}</th>
                        <th className="pb-3 pr-4 text-[13px] font-medium text-[color:var(--text-secondary)]">{t('collections.customer')}</th>
                        <th className="pb-3 pr-4 text-[13px] font-medium text-[color:var(--text-secondary)]">{t('collections.product')}</th>
                        <th className="pb-3 pr-4 text-right text-[13px] font-medium text-[color:var(--text-secondary)]">{t('collections.outstanding')}</th>
                        <th className="pb-3 pr-4 text-center text-[13px] font-medium text-[color:var(--text-secondary)]">{t('collections.dpdShort')}</th>
                        <th className="pb-3 pr-4 text-[13px] font-medium text-[color:var(--text-secondary)]">{t('collections.status')}</th>
                        <th className="pb-3 pr-4 text-[13px] font-medium text-[color:var(--text-secondary)]">{t('collections.lastAction')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => openDetail(item)}
                          className="hover:bg-[color:var(--bg-muted)] cursor-pointer transition-colors"
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          <td className="py-3 pr-4">
                            <span className="text-[color:var(--text-primary)] font-mono text-xs">{item.contractNumber}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="text-[color:var(--text-primary)]">{item.customer?.fullName || '-'}</div>
                            {item.customer?.phonePrimary && (
                              <div className="text-[color:var(--text-tertiary)] text-xs">{item.customer.phonePrimary}</div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-[color:var(--text-secondary)]">{item.product?.name || '-'}</td>
                          <td className="py-3 pr-4 text-right text-[color:var(--text-primary)] tabular-nums">
                            {formatCurrency(item.totalOutstanding, item.currency)}
                          </td>
                          <td className="py-3 pr-4 text-center">{dpdBadge(item.daysPastDue)}</td>
                          <td className="py-3 pr-4"><StatusBadge status={item.status} /></td>
                          <td className="py-3 pr-4 text-[color:var(--text-tertiary)] text-xs">
                            {item.collectionsActions?.[0]
                              ? `${item.collectionsActions[0].actionType.replace(/_/g, ' ')} — ${new Date(item.collectionsActions[0].createdAt).toLocaleDateString()}`
                              : t('common.none')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <FactoringDefaultsTable />
        </>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={selected ? `Contract ${selected.contractNumber}` : 'Contract'}>
        {selected && (
          <div className="space-y-6">
            {/* Contract details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.customer')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{selected.customer?.fullName || '-'}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.phone')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{selected.customer?.phonePrimary || '-'}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.product')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{selected.product?.name || '-'}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.status')}</span>
                <div className="mt-1"><StatusBadge status={selected.status} /></div>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.principal')}</span>
                <p className="text-[color:var(--text-primary)] mt-1 tabular-nums">{formatCurrency(selected.principalAmount, selected.currency)}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.outstanding')}</span>
                <p className="text-[color:var(--text-primary)] mt-1 font-semibold tabular-nums">{formatCurrency(selected.totalOutstanding, selected.currency)}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.daysPastDue')}</span>
                <div className="mt-1">{dpdBadge(selected.daysPastDue)}</div>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.classification')}</span>
                <p className="text-[color:var(--text-primary)] mt-1 capitalize">{selected.classification.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.startDate')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{new Date(selected.startDate).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('collections.maturityDate')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{new Date(selected.maturityDate).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Log new action */}
            <div className="pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <h3 className="section-label">{t('collections.logAction')}</h3>
              <form onSubmit={handleLogAction} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">{t('collections.actionType')}</label>
                    <select
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-full glass-input text-sm"
                    >
                      {ACTION_TYPES.map((at) => (
                        <option key={at} value={at}>{at.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">{t('collections.promiseDate')}</label>
                    <input
                      type="date"
                      value={promiseDate}
                      onChange={(e) => setPromiseDate(e.target.value)}
                      className="w-full glass-input text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">{t('collections.notes')}</label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    className="w-full glass-input text-sm"
                    rows={2}
                    placeholder={t('collections.notesPlaceholder')}
                    required
                  />
                </div>
                {actionError && <p className="text-xs text-[color:var(--status-error-text)]">{actionError}</p>}
                <button
                  type="submit"
                  disabled={logging || !actionNotes.trim()}
                  className="btn-primary w-full text-sm disabled:opacity-50"
                >
                  {logging ? t('collections.logging') : t('collections.logAction')}
                </button>
              </form>
            </div>

            {/* Action history */}
            <div className="pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <h3 className="section-label">{t('collections.actionHistory')}</h3>
              {actionsLoading ? (
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('common.loading')}</p>
              ) : actions.length === 0 ? (
                <p className="text-[color:var(--text-tertiary)] text-xs">{t('collections.noActionsYet')}</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {actions.map((a) => (
                    <div key={a.id} className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-muted)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[color:var(--text-primary)] capitalize">
                          {a.actionType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-[color:var(--text-tertiary)]">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {a.notes && <p className="text-xs text-[color:var(--text-secondary)]">{a.notes}</p>}
                      {a.promiseDate && (
                        <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
                          {t('collections.promiseDateLabel')} {new Date(a.promiseDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
