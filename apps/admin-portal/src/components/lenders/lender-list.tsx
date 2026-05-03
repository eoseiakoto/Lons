'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useToast } from '@/components/ui/toast';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { LenderForm } from './lender-form';
import { Plus } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';

const LENDERS_QUERY = gql`
  query Lenders($pagination: PaginationInput) {
    lenders(pagination: $pagination) {
      edges {
        node {
          id name licenseNumber country
          fundingCapacity fundingCurrency
          minInterestRate maxInterestRate
          settlementAccount riskParameters
          status createdAt updatedAt
        }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const CREATE_LENDER = gql`
  mutation CreateLender($input: CreateLenderInput!) {
    createLender(input: $input) {
      id name status
    }
  }
`;

const UPDATE_LENDER = gql`
  mutation UpdateLender($id: ID!, $input: UpdateLenderInput!) {
    updateLender(id: $id, input: $input) {
      id name status
    }
  }
`;

const DEACTIVATE_LENDER = gql`
  mutation DeactivateLender($id: ID!) {
    deactivateLender(id: $id) {
      id status
    }
  }
`;

interface LenderNode {
  id: string;
  name: string;
  licenseNumber?: string;
  country?: string;
  fundingCapacity?: string;
  fundingCurrency?: string;
  minInterestRate?: string;
  maxInterestRate?: string;
  settlementAccount?: Record<string, unknown>;
  riskParameters?: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function LenderList() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editLender, setEditLender] = useState<LenderNode | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<LenderNode | null>(null);

  const { data, loading, refetch } = useQuery(LENDERS_QUERY, {
    variables: { pagination: { first: 100 } },
  });

  const [createLender, { loading: creating }] = useMutation(CREATE_LENDER);
  const [updateLender, { loading: updating }] = useMutation(UPDATE_LENDER);
  const [deactivateLender, { loading: deactivating }] = useMutation(DEACTIVATE_LENDER);

  const lenders: LenderNode[] = data?.lenders?.edges?.map((e: { node: LenderNode }) => e.node) ?? [];

  const openCreate = () => {
    setEditLender(null);
    setDrawerOpen(true);
  };

  const openEdit = (lender: LenderNode) => {
    setEditLender(lender);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditLender(null);
  };

  const handleSave = async (formData: Record<string, any>) => {
    try {
      if (editLender) {
        await updateLender({ variables: { id: editLender.id, input: formData } });
        toast('success', t('lenders.updated'));
      } else {
        await createLender({ variables: { input: formData } });
        toast('success', t('lenders.created'));
      }
      closeDrawer();
      refetch();
    } catch (err: any) {
      toast('error', err?.graphQLErrors?.[0]?.message || err.message || t('lenders.errors.saveFailed'));
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    try {
      await deactivateLender({ variables: { id: confirmDeactivate.id } });
      toast('success', t('lenders.deactivated'));
      setConfirmDeactivate(null);
      refetch();
    } catch (err: any) {
      toast('error', err?.graphQLErrors?.[0]?.message || err.message || t('lenders.errors.deactivateFailed'));
      setConfirmDeactivate(null);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
      suspended: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
      inactive: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]'}`}>
        {status}
      </span>
    );
  };

  const isSystemLender = (r: LenderNode) => r.name === 'Self-Funded';

  const columns = [
    {
      header: t('lenders.name'),
      accessor: (r: LenderNode) => (
        <span className="flex items-center gap-2">
          {r.name}
          {isSystemLender(r) && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border border-[color:var(--accent-primary-soft)]">
              {t('lenders.systemBadge')}
            </span>
          )}
        </span>
      ),
    },
    { header: t('lenders.licenseNumber'), accessor: (r: LenderNode) => r.licenseNumber || '-' },
    { header: t('lenders.country'), accessor: (r: LenderNode) => r.country || '-' },
    {
      header: t('lenders.fundingCapacity'),
      accessor: (r: LenderNode) =>
        r.fundingCapacity
          ? formatMoney(r.fundingCapacity, r.fundingCurrency || 'GHS')
          : '-',
    },
    {
      header: t('lenders.interestRange'),
      accessor: (r: LenderNode) => {
        if (!r.minInterestRate && !r.maxInterestRate) return '-';
        const min = r.minInterestRate ? `${Number(r.minInterestRate).toFixed(1)}%` : '—';
        const max = r.maxInterestRate ? `${Number(r.maxInterestRate).toFixed(1)}%` : '—';
        return `${min} – ${max}`;
      },
    },
    {
      header: t('common.status'),
      accessor: (r: LenderNode) => statusBadge(r.status),
    },
    {
      header: '',
      accessor: (r: LenderNode) =>
        r.status === 'active' && !isSystemLender(r) ? (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDeactivate(r); }}
            className="text-xs text-[color:var(--status-error-text)] hover:opacity-80 transition-colors"
          >
            {t('lenders.deactivate')}
          </button>
        ) : null,
    },
  ];

  if (loading) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <PageHeader eyebrow={t('eyebrow.fundingPartners')} title={t('lenders.title')} subtitle={t('common.loading')} />
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
        eyebrow={t('eyebrow.fundingPartners')}
        title={t('lenders.title')}
        subtitle={t('lenders.subtitle', { count: lenders.length }) + '. ' + t('lenders.subtitleDescription')}
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('lenders.addLender')}
          </button>
        }
      />

      <div className="relative z-10 card-glow overflow-hidden">
        <DataTable
          columns={columns}
          data={lenders}
          onRowClick={openEdit}
          emptyMessage={t('lenders.noLenders')}
        />
      </div>

      {/* Create / Edit Drawer */}
      <Drawer open={drawerOpen} onClose={closeDrawer} title={editLender ? t('lenders.editLender') : t('lenders.addLender')}>
        <LenderForm
          lender={editLender}
          onSave={handleSave}
          onCancel={closeDrawer}
          saving={creating || updating}
        />
      </Drawer>

      {/* Deactivate Confirmation Modal */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card p-6 rounded-xl max-w-md w-full mx-4 border border-[color:var(--border-subtle)]">
            <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)] mb-2">{t('lenders.confirmDeactivate')}</h3>
            <p className="text-sm text-[color:var(--text-secondary)] mb-6">
              {t('lenders.confirmDeactivateMessage', { name: confirmDeactivate.name })}
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
                {deactivating ? t('common.saving') : t('lenders.deactivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
