'use client';

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate } from '@/lib/utils';

const CONTRACTS_QUERY = gql`
  query Contracts($pagination: PaginationInput, $status: String) {
    contracts(pagination: $pagination, status: $status) {
      edges {
        node {
          id contractNumber customerId productId currency
          principalAmount totalOutstanding daysPastDue
          status classification repaymentMethod
          startDate maturityDate createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export default function ContractsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const { data, loading } = useQuery(CONTRACTS_QUERY, {
    variables: { pagination: { first: 50 }, status: statusFilter || undefined },
  });
  const contracts = data?.contracts?.edges?.map((e: any) => e.node) || [];

  return (
    <div>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Contracts</h1>
      <div className="flex items-center space-x-4 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="glass-input text-sm">
          <option value="">All Statuses</option>
          <option value="performing">Performing</option>
          <option value="due">Due</option>
          <option value="overdue">Overdue</option>
          <option value="delinquent">Delinquent</option>
          <option value="default_status">Default</option>
          <option value="settled">Settled</option>
        </select>
      </div>
      {loading ? <div className="text-white/40">Loading...</div> : (
        <div className="glass overflow-hidden">
          <DataTable
            columns={[
              { header: 'Contract #', accessor: 'contractNumber' },
              { header: 'Principal', accessor: (r: any) => formatMoney(r.principalAmount, r.currency) },
              { header: 'Outstanding', accessor: (r: any) => formatMoney(r.totalOutstanding || '0', r.currency) },
              { header: 'DPD', accessor: 'daysPastDue' },
              { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
              { header: 'Classification', accessor: (r: any) => <StatusBadge status={r.classification} /> },
              { header: 'Start Date', accessor: (r: any) => formatDate(r.startDate) },
              { header: 'Maturity', accessor: (r: any) => formatDate(r.maturityDate) },
            ]}
            data={contracts}
            onRowClick={(r: any) => router.push(`/loans/contracts/${r.id}`)}
          />
        </div>
      )}
    </div>
  );
}
