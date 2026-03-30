'use client';

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterBar, type FilterDef } from '@/components/ui/filter-bar';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { formatMoney, formatDate } from '@/lib/utils';
import { CollectionsActionDrawer } from './action-drawer';

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
      label: 'All Classifications',
      type: 'select',
      options: [
        { value: 'substandard', label: 'Substandard' },
        { value: 'doubtful', label: 'Doubtful' },
        { value: 'loss', label: 'Loss' },
      ],
      value: classification,
      onChange: setClassification,
    },
    {
      key: 'dpd',
      label: 'All DPD Ranges',
      type: 'select',
      options: [
        { value: '1-30', label: '1-30 Days' },
        { value: '31-60', label: '31-60 Days' },
        { value: '61-90', label: '61-90 Days' },
        { value: '90+', label: '90+ Days' },
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

      <div className="glass overflow-hidden">
        {loading && contracts.length === 0 ? (
          <div className="p-6 text-white/40">Loading...</div>
        ) : (
          <DataTable
            columns={[
              { header: 'Contract #', accessor: 'contractNumber' },
              { header: 'Customer', accessor: (r: any) => r.customer?.fullName || r.customer?.externalId || r.customerId.slice(0, 8) },
              { header: 'DPD', accessor: (r: any) => (
                <span className={`font-mono font-bold ${r.daysPastDue > 90 ? 'text-red-400' : r.daysPastDue > 60 ? 'text-orange-400' : 'text-amber-400'}`}>
                  {r.daysPastDue}
                </span>
              )},
              { header: 'Outstanding', accessor: (r: any) => formatMoney(r.totalOutstanding || '0', r.currency) },
              { header: 'Classification', accessor: (r: any) => <StatusBadge status={r.classification} /> },
              {
                header: 'Last Action',
                accessor: (r: any) => {
                  const la = r.lastCollectionAction;
                  if (!la) return <span className="text-white/20">None</span>;
                  return (
                    <div className="text-xs">
                      <span className="text-white/60">{la.actionType?.replace(/_/g, ' ')}</span>
                      <br />
                      <span className="text-white/30">{formatDate(la.createdAt)}</span>
                    </div>
                  );
                },
              },
            ]}
            data={contracts}
            onRowClick={(r: any) => setSelectedContractId(r.id)}
            emptyMessage="No contracts in collections queue"
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
