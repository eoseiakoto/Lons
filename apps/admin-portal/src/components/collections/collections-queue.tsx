'use client';

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterBar, type FilterDef } from '@/components/ui/filter-bar';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { formatMoney, formatDate } from '@/lib/utils';
import { CollectionsActionDrawer } from './action-drawer';
import { useI18n } from '@/lib/i18n';

const COLLECTIONS_QUEUE_QUERY = gql`
  query CollectionsQueue($pagination: PaginationInput, $classification: String, $minDpd: Int, $maxDpd: Int) {
    contracts(
      pagination: $pagination
      status: "overdue"
      classification: $classification
      minDpd: $minDpd
      maxDpd: $maxDpd
    ) {
      edges {
        node {
          id contractNumber customerId currency
          principalAmount totalOutstanding daysPastDue
          status classification
          customer { id fullName externalId }
          lastCollectionAction { actionType createdAt }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export function CollectionsQueue() {
  const { t } = useI18n();
  const [classification, setClassification] = useState('');
  const [dpdRange, setDpdRange] = useState('');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  const dpdVars: { minDpd?: number; maxDpd?: number } = {};
  if (dpdRange === '1-30') { dpdVars.minDpd = 1; dpdVars.maxDpd = 30; }
  else if (dpdRange === '31-60') { dpdVars.minDpd = 31; dpdVars.maxDpd = 60; }
  else if (dpdRange === '61-90') { dpdVars.minDpd = 61; dpdVars.maxDpd = 90; }
  else if (dpdRange === '90+') { dpdVars.minDpd = 91; }

  const { data, loading, fetchMore, refetch } = useQuery(COLLECTIONS_QUEUE_QUERY, {
    variables: {
      pagination: { first: 30 },
      classification: classification || undefined,
      ...dpdVars,
    },
    fetchPolicy: 'cache-and-network',
  });

  const contracts = data?.contracts?.edges?.map((e: any) => e.node) || [];
  const pageInfo = data?.contracts?.pageInfo;

  const filters: FilterDef[] = [
    {
      key: 'classification',
      label: t('collections.queue.filter.allClassifications'),
      type: 'select',
      options: [
        { value: 'substandard', label: t('collections.queue.classification.substandard') },
        { value: 'doubtful', label: t('collections.queue.classification.doubtful') },
        { value: 'loss', label: t('collections.queue.classification.loss') },
      ],
      value: classification,
      onChange: setClassification,
    },
    {
      key: 'dpd',
      label: t('collections.queue.filter.allDpdRanges'),
      type: 'select',
      options: [
        { value: '1-30', label: t('collections.queue.dpd.1_30') },
        { value: '31-60', label: t('collections.queue.dpd.31_60') },
        { value: '61-90', label: t('collections.queue.dpd.61_90') },
        { value: '90+', label: t('collections.queue.dpd.90Plus') },
      ],
      value: dpdRange,
      onChange: setDpdRange,
    },
  ];

  const handleReset = () => {
    setClassification('');
    setDpdRange('');
  };

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} onReset={handleReset} />

      <div className="card-flush overflow-hidden">
        {loading && contracts.length === 0 ? (
          <div className="p-6 text-[color:var(--text-tertiary)]">{t('common.loading')}</div>
        ) : (
          <DataTable
            columns={[
              { header: t('collections.queue.column.contractNumber'), accessor: 'contractNumber' },
              { header: t('collections.queue.column.customer'), accessor: (r: any) => r.customer?.fullName || r.customer?.externalId || r.customerId.slice(0, 8) },
              { header: t('collections.queue.column.dpd'), accessor: (r: any) => (
                <span className={`font-mono font-bold ${r.daysPastDue > 90 ? 'text-[color:var(--status-error-text)]' : r.daysPastDue > 60 ? 'text-[color:var(--status-warning-text)]' : 'text-[color:var(--status-warning-text)]'}`}>
                  {r.daysPastDue}
                </span>
              )},
              { header: t('collections.queue.column.outstanding'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalOutstanding || '0', r.currency)}</span> },
              { header: t('collections.queue.column.classification'), accessor: (r: any) => <StatusBadge status={r.classification} /> },
              {
                header: t('collections.queue.column.lastAction'),
                accessor: (r: any) => {
                  const la = r.lastCollectionAction;
                  if (!la) return <span className="text-[color:var(--text-tertiary)]">{t('common.none')}</span>;
                  return (
                    <div className="text-xs">
                      <span className="text-[color:var(--text-secondary)]">{la.actionType?.replace(/_/g, ' ')}</span>
                      <br />
                      <span className="text-[color:var(--text-tertiary)]">{formatDate(la.createdAt)}</span>
                    </div>
                  );
                },
              },
            ]}
            data={contracts}
            onRowClick={(r: any) => setSelectedContractId(r.id)}
            emptyMessage={t('collections.queue.emptyMessage')}
          />
        )}
      </div>

      <PaginationControls
        hasNextPage={pageInfo?.hasNextPage || false}
        loading={loading}
        onLoadMore={() => {
          if (pageInfo?.endCursor) {
            fetchMore({
              variables: { pagination: { first: 30, after: pageInfo.endCursor } },
              updateQuery: (prev: any, { fetchMoreResult }: any) => {
                if (!fetchMoreResult) return prev;
                return {
                  contracts: {
                    ...fetchMoreResult.contracts,
                    edges: [...prev.contracts.edges, ...fetchMoreResult.contracts.edges],
                  },
                };
              },
            });
          }
        }}
      />

      <CollectionsActionDrawer
        open={!!selectedContractId}
        onClose={() => setSelectedContractId(null)}
        contractId={selectedContractId}
        onActionComplete={() => refetch()}
      />
    </div>
  );
}
