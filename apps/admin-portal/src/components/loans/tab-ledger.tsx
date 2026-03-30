'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatDate } from '@/lib/utils';
import { BookOpen } from 'lucide-react';

const CONTRACT_LEDGER_QUERY = gql`
  query ContractLedger($contractId: ID!, $pagination: PaginationInput) {
    ledgerEntries(contractId: $contractId, pagination: $pagination) {
      edges {
        node {
          id entryType description debitAmount creditAmount
          runningBalance currency createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface TabLedgerProps {
  contractId: string;
  currency: string;
}

export function TabLedger({ contractId, currency }: TabLedgerProps) {
  const { data, loading } = useQuery(CONTRACT_LEDGER_QUERY, {
    variables: { contractId, pagination: { first: 100 } },
  });

  const entries = data?.ledgerEntries?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-white/5 rounded" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No Ledger Entries"
        description="No ledger entries have been recorded for this contract."
      />
    );
  }

  return (
    <div className="overflow-hidden">
      <DataTable
        columns={[
          { header: 'Date', accessor: (r: any) => formatDate(r.createdAt) },
          { header: 'Type', accessor: (r: any) => <StatusBadge status={r.entryType} /> },
          { header: 'Description', accessor: 'description' },
          {
            header: 'Debit',
            accessor: (r: any) =>
              r.debitAmount && parseFloat(r.debitAmount) > 0 ? (
                <span className="text-red-400">{formatMoney(r.debitAmount, r.currency || currency)}</span>
              ) : (
                '-'
              ),
          },
          {
            header: 'Credit',
            accessor: (r: any) =>
              r.creditAmount && parseFloat(r.creditAmount) > 0 ? (
                <span className="text-emerald-400">{formatMoney(r.creditAmount, r.currency || currency)}</span>
              ) : (
                '-'
              ),
          },
          {
            header: 'Balance',
            accessor: (r: any) =>
              r.runningBalance !== null && r.runningBalance !== undefined
                ? formatMoney(r.runningBalance, r.currency || currency)
                : '-',
          },
        ]}
        data={entries}
      />
    </div>
  );
}
