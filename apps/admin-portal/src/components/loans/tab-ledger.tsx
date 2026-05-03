'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
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
  const { t } = useI18n();
  const { data, loading } = useQuery(CONTRACT_LEDGER_QUERY, {
    variables: { contractId, pagination: { first: 100 } },
  });

  const entries = data?.ledgerEntries?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-[color:var(--bg-muted)] rounded" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title={t('loans.ledger.emptyTitle')}
        description={t('loans.ledger.emptyDescription')}
      />
    );
  }

  return (
    <div className="overflow-hidden">
      <DataTable
        columns={[
          { header: t('loans.ledger.column.date'), accessor: (r: any) => formatDate(r.createdAt) },
          { header: t('loans.ledger.column.type'), accessor: (r: any) => <StatusBadge status={r.entryType} /> },
          { header: t('loans.ledger.column.description'), accessor: 'description' },
          {
            header: t('loans.ledger.column.debit'),
            accessor: (r: any) =>
              r.debitAmount && parseFloat(r.debitAmount) > 0 ? (
                <span className="text-[color:var(--status-error-text)] tabular-nums">{formatMoney(r.debitAmount, r.currency || currency)}</span>
              ) : (
                '-'
              ),
          },
          {
            header: t('loans.ledger.column.credit'),
            accessor: (r: any) =>
              r.creditAmount && parseFloat(r.creditAmount) > 0 ? (
                <span className="text-[color:var(--status-success-text)] tabular-nums">{formatMoney(r.creditAmount, r.currency || currency)}</span>
              ) : (
                '-'
              ),
          },
          {
            header: t('loans.ledger.column.balance'),
            accessor: (r: any) =>
              r.runningBalance !== null && r.runningBalance !== undefined
                ? <span className="tabular-nums">{formatMoney(r.runningBalance, r.currency || currency)}</span>
                : '-',
          },
        ]}
        data={entries}
      />
    </div>
  );
}
