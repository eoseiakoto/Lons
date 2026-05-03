'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@apollo/client';
import { Plus, Filter } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { FilterPill } from '@/components/ui/filter-pill';
import { formatMoney } from '@/lib/utils';
import {
  DEBTORS_QUERY,
  CREATE_DEBTOR_MUTATION,
  UPDATE_DEBTOR_MUTATION,
  SUSPEND_DEBTOR_MUTATION,
  BLACKLIST_DEBTOR_MUTATION,
  REACTIVATE_DEBTOR_MUTATION,
  type IDebtor,
  type DebtorStatus,
} from '@/lib/graphql/factoring';
import { DebtorForm } from './debtor-form';
import { DebtorStatusBadge } from './debtor-status-badge';
import { DebtorRiskBadge } from './debtor-risk-badge';

type StatusFilterValue = '' | DebtorStatus;
type ConfirmAction = 'suspend' | 'blacklist';

interface ConfirmState {
  action: ConfirmAction;
  debtor: IDebtor;
}

const PAGE_SIZE = 50;

/**
 * Debtor list — top-level page for the Invoice Factoring debtor registry.
 * Mirrors the merchants page pattern: cursor-paginated list, status pill
 * column, slide-over create/edit form, confirmation modals for suspend +
 * blacklist (both require a free-text reason).
 */
export function DebtorList() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<IDebtor | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reason, setReason] = useState('');

  const { data, loading, refetch } = useQuery(DEBTORS_QUERY, {
    variables: {
      filters: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      },
      pagination: { first: PAGE_SIZE },
    },
    fetchPolicy: 'cache-and-network',
  });

  const [createDebtor, { loading: creating }] = useMutation(
    CREATE_DEBTOR_MUTATION,
  );
  const [updateDebtor, { loading: updating }] = useMutation(
    UPDATE_DEBTOR_MUTATION,
  );
  const [suspendDebtor, { loading: suspending }] = useMutation(
    SUSPEND_DEBTOR_MUTATION,
  );
  const [blacklistDebtor, { loading: blacklisting }] = useMutation(
    BLACKLIST_DEBTOR_MUTATION,
  );
  const [reactivateDebtor] = useMutation(REACTIVATE_DEBTOR_MUTATION);

  const debtors: IDebtor[] =
    data?.debtors?.edges?.map((edge: { node: IDebtor }) => edge.node) ?? [];
  const totalCount: number = data?.debtors?.totalCount ?? 0;

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (d: IDebtor) => {
    setEditing(d);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const handleSave = async (formData: Record<string, unknown>) => {
    const idempotencyKey = `${editing ? 'update' : 'create'}-debtor-${editing?.id ?? 'new'}-${Date.now()}`;
    try {
      if (editing) {
        await updateDebtor({
          variables: {
            debtorId: editing.id,
            input: formData,
            idempotencyKey,
          },
        });
        toast('success', t('debtors.toast.updated'));
      } else {
        await createDebtor({
          variables: { input: formData, idempotencyKey },
        });
        toast('success', t('debtors.toast.created'));
      }
      closeDrawer();
      refetch();
    } catch (err) {
      const e = err as { graphQLErrors?: { message: string }[]; message?: string };
      toast(
        'error',
        e.graphQLErrors?.[0]?.message || e.message || t('debtors.toast.errorSave'),
      );
    }
  };

  const handleReactivate = async (d: IDebtor) => {
    try {
      await reactivateDebtor({
        variables: {
          debtorId: d.id,
          idempotencyKey: `reactivate-debtor-${d.id}-${Date.now()}`,
        },
      });
      toast('success', t('debtors.toast.reactivated'));
      refetch();
    } catch (err) {
      const e = err as { message?: string };
      toast('error', e.message || t('debtors.toast.errorReactivate'));
    }
  };

  const handleConfirm = async () => {
    if (!confirm || !reason.trim()) return;
    const idempotencyKey = `${confirm.action}-debtor-${confirm.debtor.id}-${Date.now()}`;
    try {
      if (confirm.action === 'suspend') {
        await suspendDebtor({
          variables: {
            debtorId: confirm.debtor.id,
            reason: reason.trim(),
            idempotencyKey,
          },
        });
        toast('success', t('debtors.toast.suspended'));
      } else {
        await blacklistDebtor({
          variables: {
            debtorId: confirm.debtor.id,
            reason: reason.trim(),
            idempotencyKey,
          },
        });
        toast('success', t('debtors.toast.blacklisted'));
      }
      setConfirm(null);
      setReason('');
      refetch();
    } catch (err) {
      const e = err as { message?: string };
      toast(
        'error',
        e.message ||
          (confirm.action === 'suspend'
            ? t('debtors.toast.errorSuspend')
            : t('debtors.toast.errorBlacklist')),
      );
    }
  };

  const columns = [
    {
      header: t('debtors.list.column.companyName'),
      accessor: (d: IDebtor) => (
        <Link
          href={`/debtors/${d.id}`}
          className="text-[color:var(--text-primary)] hover:text-[color:var(--accent-primary)] transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {d.companyName}
        </Link>
      ),
    },
    {
      header: t('debtors.list.column.registrationNumber'),
      accessor: (d: IDebtor) => (
        <span className="text-[color:var(--text-secondary)] font-mono text-xs">
          {d.registrationNumber || '—'}
        </span>
      ),
    },
    {
      header: t('debtors.list.column.industrySector'),
      accessor: (d: IDebtor) => d.industrySector || '—',
    },
    {
      header: t('debtors.list.column.country'),
      accessor: (d: IDebtor) => d.country,
    },
    {
      header: t('debtors.list.column.riskScore'),
      accessor: (d: IDebtor) => <DebtorRiskBadge score={d.internalRiskScore} />,
    },
    {
      header: t('debtors.list.column.totalExposure'),
      accessor: (d: IDebtor) => (
        <span className="tabular-nums">
          {formatMoney(d.totalExposure || '0', 'GHS')}
        </span>
      ),
    },
    {
      header: t('debtors.list.column.status'),
      accessor: (d: IDebtor) => <DebtorStatusBadge status={d.status} />,
    },
    {
      header: '',
      accessor: (d: IDebtor) => (
        <div className="flex items-center gap-2 text-xs">
          {d.status === 'active' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirm({ action: 'suspend', debtor: d });
                setReason('');
              }}
              className="text-[color:var(--status-warning-text)] hover:opacity-80 transition-colors"
            >
              {t('debtors.actions.suspend')}
            </button>
          )}
          {d.status !== 'blacklisted' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirm({ action: 'blacklist', debtor: d });
                setReason('');
              }}
              className="text-[color:var(--status-error-text)] hover:opacity-80 transition-colors"
            >
              {t('debtors.actions.blacklist')}
            </button>
          )}
          {(d.status === 'suspended' || d.status === 'blacklisted') && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleReactivate(d);
              }}
              className="text-[color:var(--status-success-text)] hover:opacity-80 transition-colors"
            >
              {t('debtors.actions.reactivate')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('debtors.eyebrow')}
        title={t('debtors.title')}
        subtitle={
          totalCount > 0
            ? t('debtors.subtitleWithCount', { count: totalCount })
            : t('debtors.subtitle')
        }
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('debtors.addDebtor')}
          </button>
        }
      />

      <section className="relative z-10 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">{t('common.filter')}</span>
        </div>
        <FilterPill
          label={t('debtors.list.filterByStatus')}
          options={[
            { value: '', label: t('common.allStatuses') },
            { value: 'active', label: t('debtors.status.active') },
            { value: 'under_review', label: t('debtors.status.underReview') },
            { value: 'suspended', label: t('debtors.status.suspended') },
            { value: 'blacklisted', label: t('debtors.status.blacklisted') },
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilterValue)}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('debtors.list.searchPlaceholder')}
          className="glass-input text-sm flex-1 min-w-[220px]"
        />
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {t('debtors.list.countLabel', { count: debtors.length })}
        </span>
      </section>

      <div className="relative z-10 card-glow overflow-hidden">
        {loading && debtors.length === 0 ? (
          <div className="p-12 text-center text-[color:var(--text-tertiary)] text-sm">
            {t('common.loading')}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={debtors}
            onRowClick={openEdit}
            emptyMessage={t('debtors.list.empty')}
          />
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? t('debtors.editDebtor') : t('debtors.addDebtor')}
      >
        <DebtorForm
          debtor={editing}
          onSave={handleSave}
          onCancel={closeDrawer}
          saving={creating || updating}
        />
      </Drawer>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 rounded-xl max-w-md w-full mx-4 border border-[color:var(--border-subtle)]">
            <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)] mb-2">
              {confirm.action === 'suspend'
                ? t('debtors.confirm.suspendTitle')
                : t('debtors.confirm.blacklistTitle')}
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] mb-4">
              {confirm.action === 'suspend'
                ? t('debtors.confirm.suspendMessage', {
                    name: confirm.debtor.companyName,
                  })
                : t('debtors.confirm.blacklistMessage', {
                    name: confirm.debtor.companyName,
                  })}
            </p>
            <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">
              {t('debtors.confirm.reasonLabel')}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('debtors.confirm.reasonPlaceholder')}
              className="glass-input w-full text-sm mb-6"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirm(null);
                  setReason('');
                }}
                className="glass-button text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  (confirm.action === 'suspend' ? suspending : blacklisting) ||
                  !reason.trim()
                }
                className={`px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50 ${
                  confirm.action === 'suspend'
                    ? 'bg-[color:var(--status-warning-soft)] border border-[color:var(--status-warning)] text-[color:var(--status-warning-text)]'
                    : 'bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)]'
                }`}
              >
                {(confirm.action === 'suspend' ? suspending : blacklisting)
                  ? t('common.saving')
                  : confirm.action === 'suspend'
                    ? t('debtors.actions.suspend')
                    : t('debtors.actions.blacklist')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
