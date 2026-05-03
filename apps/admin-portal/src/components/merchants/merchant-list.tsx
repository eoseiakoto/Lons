'use client';

import { useState } from 'react';
import Link from 'next/link';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Plus } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { bankersRound, multiply } from '@/lib/decimal';

import { MerchantForm } from './merchant-form';

const MERCHANTS_QUERY = gql`
  query Merchants($first: Int, $after: String, $filters: MerchantFiltersInput) {
    merchants(first: $first, after: $after, filters: $filters) {
      edges {
        node {
          id name code status settlementType discountRate
          contactEmail contactPhone walletId walletProvider
          onboardedAt createdAt updatedAt
        }
        cursor
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const CREATE_MERCHANT = gql`
  mutation CreateMerchant($input: CreateMerchantInput!) {
    createMerchant(input: $input) { id name status }
  }
`;

const UPDATE_MERCHANT = gql`
  mutation UpdateMerchant($id: ID!, $input: UpdateMerchantInput!) {
    updateMerchant(id: $id, input: $input) { id name status }
  }
`;

const ACTIVATE_MERCHANT = gql`
  mutation ActivateMerchant($id: ID!) {
    activateMerchant(id: $id) { id status }
  }
`;

const SUSPEND_MERCHANT = gql`
  mutation SuspendMerchant($id: ID!, $reason: String!) {
    suspendMerchant(id: $id, reason: $reason) { id status }
  }
`;

const REACTIVATE_MERCHANT = gql`
  mutation ReactivateMerchant($id: ID!) {
    reactivateMerchant(id: $id) { id status }
  }
`;

const DEACTIVATE_MERCHANT = gql`
  mutation DeactivateMerchant($id: ID!) {
    deactivateMerchant(id: $id) { id status }
  }
`;

interface MerchantNode {
  id: string;
  name: string;
  code: string;
  status: 'pending' | 'active' | 'suspended' | 'deactivated';
  settlementType: 'IMMEDIATE' | 'T_PLUS_1';
  discountRate: string;
  contactEmail?: string;
  contactPhone?: string;
  walletId?: string;
  walletProvider?: string;
  onboardedAt?: string;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = '' | 'pending' | 'active' | 'suspended' | 'deactivated';

export function MerchantList() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMerchant, setEditMerchant] = useState<MerchantNode | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<MerchantNode | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState<MerchantNode | null>(null);

  const { data, loading, refetch } = useQuery(MERCHANTS_QUERY, {
    variables: {
      first: 100,
      filters: statusFilter ? { status: statusFilter } : undefined,
    },
  });

  const [createMerchant, { loading: creating }] = useMutation(CREATE_MERCHANT);
  const [updateMerchant, { loading: updating }] = useMutation(UPDATE_MERCHANT);
  const [activateMerchant] = useMutation(ACTIVATE_MERCHANT);
  const [suspendMerchant, { loading: suspending }] = useMutation(SUSPEND_MERCHANT);
  const [reactivateMerchant] = useMutation(REACTIVATE_MERCHANT);
  const [deactivateMerchant, { loading: deactivating }] = useMutation(DEACTIVATE_MERCHANT);

  const merchants: MerchantNode[] =
    data?.merchants?.edges?.map((e: { node: MerchantNode }) => e.node) ?? [];

  // FIX 19: client-side text filter on name + code. Status filter
  // already runs server-side (and was applied on the variables above).
  const filteredMerchants = search.trim()
    ? merchants.filter((m) => {
        const q = search.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)
        );
      })
    : merchants;

  const openCreate = () => {
    setEditMerchant(null);
    setDrawerOpen(true);
  };
  const openEdit = (m: MerchantNode) => {
    setEditMerchant(m);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditMerchant(null);
  };

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      if (editMerchant) {
        await updateMerchant({ variables: { id: editMerchant.id, input: formData } });
        toast('success', t('merchants.updated'));
      } else {
        await createMerchant({ variables: { input: formData } });
        toast('success', t('merchants.created'));
      }
      closeDrawer();
      refetch();
    } catch (err) {
      const e = err as { graphQLErrors?: { message: string }[]; message?: string };
      toast('error', e.graphQLErrors?.[0]?.message || e.message || t('merchants.error.save'));
    }
  };

  const handleActivate = async (m: MerchantNode) => {
    try {
      await activateMerchant({ variables: { id: m.id } });
      toast('success', t('merchants.activated'));
      refetch();
    } catch (err) {
      const e = err as { message?: string };
      toast('error', e.message || t('merchants.error.activate'));
    }
  };

  const handleReactivate = async (m: MerchantNode) => {
    try {
      await reactivateMerchant({ variables: { id: m.id } });
      toast('success', t('merchants.reactivated'));
      refetch();
    } catch (err) {
      const e = err as { message?: string };
      toast('error', e.message || t('merchants.error.reactivate'));
    }
  };

  const handleSuspend = async () => {
    if (!confirmSuspend || !suspendReason.trim()) return;
    try {
      await suspendMerchant({
        variables: { id: confirmSuspend.id, reason: suspendReason.trim() },
      });
      toast('success', t('merchants.suspended'));
      setConfirmSuspend(null);
      setSuspendReason('');
      refetch();
    } catch (err) {
      const e = err as { message?: string };
      toast('error', e.message || t('merchants.error.suspend'));
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    try {
      await deactivateMerchant({ variables: { id: confirmDeactivate.id } });
      toast('success', t('merchants.deactivated'));
      setConfirmDeactivate(null);
      refetch();
    } catch (err) {
      const e = err as { message?: string };
      toast('error', e.message || t('merchants.error.deactivate'));
    }
  };

  const statusBadge = (status: MerchantNode['status']) => {
    const colors: Record<string, string> = {
      active:
        'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
      pending:
        'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
      suspended:
        'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
      deactivated:
        'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]',
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
          colors[status] ||
          'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]'
        }`}
      >
        {t(`merchants.status${status.charAt(0).toUpperCase()}${status.slice(1)}`)}
      </span>
    );
  };

  const settlementBadge = (type: MerchantNode['settlementType']) => (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]">
      {type === 'IMMEDIATE' ? t('merchants.settlementImmediate') : t('merchants.settlementTPlusOne')}
    </span>
  );

  // Decimal-string math throughout — never `Number(rate)` on monetary
  // fields. The discount rate stored as e.g. "0.0250" → "2.50%".
  const formatRate = (rate: string) => `${bankersRound(multiply(rate, '100'), 2)}%`;

  const columns = [
    {
      header: t('merchants.name'),
      accessor: (m: MerchantNode) => (
        <Link
          href={`/merchants/${m.id}`}
          className="text-[color:var(--text-primary)] hover:text-[color:var(--accent-primary)] transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {m.name}
        </Link>
      ),
    },
    { header: t('merchants.code'), accessor: (m: MerchantNode) => m.code },
    {
      header: t('merchants.settlementType'),
      accessor: (m: MerchantNode) => settlementBadge(m.settlementType),
    },
    {
      header: t('merchants.discountRate'),
      accessor: (m: MerchantNode) => formatRate(m.discountRate),
    },
    {
      header: t('merchants.contactEmail'),
      accessor: (m: MerchantNode) => m.contactEmail || '-',
    },
    { header: t('merchants.status'), accessor: (m: MerchantNode) => statusBadge(m.status) },
    {
      header: '',
      accessor: (m: MerchantNode) => (
        <div className="flex items-center gap-2 text-xs">
          {m.status === 'pending' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleActivate(m);
              }}
              className="text-[color:var(--status-success-text)] hover:opacity-80 transition-colors"
            >
              {t('merchants.actions.activate')}
            </button>
          )}
          {m.status === 'active' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmSuspend(m);
              }}
              className="text-[color:var(--status-warning-text)] hover:opacity-80 transition-colors"
            >
              {t('merchants.actions.suspend')}
            </button>
          )}
          {m.status === 'suspended' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleReactivate(m);
              }}
              className="text-[color:var(--status-success-text)] hover:opacity-80 transition-colors"
            >
              {t('merchants.actions.reactivate')}
            </button>
          )}
          {m.status !== 'deactivated' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeactivate(m);
              }}
              className="text-[color:var(--status-error-text)] hover:opacity-80 transition-colors"
            >
              {t('merchants.actions.deactivate')}
            </button>
          )}
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <PageHeader
          eyebrow={t('eyebrow.fundingPartners') || 'BNPL'}
          title={t('merchants.title')}
          subtitle={t('common.loading')}
        />
        <div className="relative z-10 card-glow p-12 text-center text-[color:var(--text-tertiary)]">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />
      <PageHeader
        eyebrow={t('eyebrow.fundingPartners') || 'BNPL'}
        title={t('merchants.title')}
        subtitle={
          merchants.length > 0
            ? `${merchants.length} merchant${merchants.length === 1 ? '' : 's'}. ${t('merchants.subtitle')}`
            : t('merchants.subtitle')
        }
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('merchants.addMerchant')}
          </button>
        }
      />

      <div className="relative z-10 flex flex-wrap items-center gap-3">
        <label className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {t('merchants.status')}
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="glass-input text-sm"
        >
          <option value="">{t('common.all') || 'All'}</option>
          <option value="pending">{t('merchants.statusPending')}</option>
          <option value="active">{t('merchants.statusActive')}</option>
          <option value="suspended">{t('merchants.statusSuspended')}</option>
          <option value="deactivated">{t('merchants.statusDeactivated')}</option>
        </select>
        {/* FIX 19: text search across name + code (client-side). */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('merchants.search')}
          className="glass-input text-sm flex-1 min-w-[200px]"
        />
      </div>

      <div className="relative z-10 card-glow overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredMerchants}
          onRowClick={openEdit}
          emptyMessage={t('merchants.noMerchants')}
        />
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editMerchant ? t('merchants.editMerchant') : t('merchants.addMerchant')}
      >
        <MerchantForm
          merchant={editMerchant}
          onSave={handleSave}
          onCancel={closeDrawer}
          saving={creating || updating}
        />
      </Drawer>

      {confirmSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 rounded-xl max-w-md w-full mx-4 border border-[color:var(--border-subtle)]">
            <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)] mb-2">
              {t('merchants.confirmSuspend')}
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] mb-4">
              {t('merchants.confirmSuspendMessage', { name: confirmSuspend.name })}
            </p>
            <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">
              {t('merchants.suspendReason')}
            </label>
            <input
              type="text"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="fraud_alert"
              className="glass-input w-full text-sm mb-6"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmSuspend(null);
                  setSuspendReason('');
                }}
                className="glass-button text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSuspend}
                disabled={suspending || !suspendReason.trim()}
                className="px-4 py-2 bg-[color:var(--status-warning-soft)] border border-[color:var(--status-warning)] text-[color:var(--status-warning-text)] rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50"
              >
                {suspending ? t('common.saving') : t('merchants.actions.suspend')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 rounded-xl max-w-md w-full mx-4 border border-[color:var(--border-subtle)]">
            <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)] mb-2">
              {t('merchants.confirmDeactivate')}
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] mb-6">
              {t('merchants.confirmDeactivateMessage', { name: confirmDeactivate.name })}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="glass-button text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="px-4 py-2 bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50"
              >
                {deactivating ? t('common.saving') : t('merchants.actions.deactivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
