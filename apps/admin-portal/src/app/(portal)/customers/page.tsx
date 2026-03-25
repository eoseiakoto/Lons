'use client';

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';

const CUSTOMERS_QUERY = gql`
  query Customers($pagination: PaginationInput, $status: String, $kycLevel: String) {
    customers(pagination: $pagination, status: $status, kycLevel: $kycLevel) {
      edges {
        node { id externalId fullName phonePrimary email kycLevel status watchlist country createdAt }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export default function CustomersPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const { data, loading } = useQuery(CUSTOMERS_QUERY, {
    variables: { pagination: { first: 50 }, status: statusFilter || undefined },
  });
  const customers = data?.customers?.edges?.map((e: any) => e.node) || [];

  return (
    <div>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Customers</h1>
      <div className="flex items-center space-x-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="glass-input text-sm"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="blacklisted">Blacklisted</option>
        </select>
      </div>
      {loading ? <div className="text-white/40">Loading...</div> : (
        <div className="glass overflow-hidden">
          <DataTable
            columns={[
              { header: 'External ID', accessor: 'externalId' },
              { header: 'Name', accessor: 'fullName' },
              { header: 'Phone', accessor: 'phonePrimary' },
              { header: 'KYC Level', accessor: (r: any) => r.kycLevel.replace(/_/g, ' ') },
              { header: 'Country', accessor: 'country' },
              { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
            ]}
            data={customers}
            onRowClick={(r: any) => router.push(`/customers/${r.id}`)}
          />
        </div>
      )}
    </div>
  );
}
