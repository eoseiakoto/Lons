'use client';

import { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatMoney } from '@/lib/utils';

const TENANT_QUERY = gql`
  query Tenant($id: ID!) {
    tenant(id: $id) {
      id
      name
    }
  }
`;

const CUSTOMERS_QUERY = gql`
  query Customers($pagination: PaginationInput, $status: String, $kycLevel: String, $tenantId: ID) {
    customers(pagination: $pagination, status: $status, kycLevel: $kycLevel, tenantId: $tenantId) {
      edges {
        node {
          id
          externalId
          fullName
          phonePrimary
          email
          kycLevel
          status
          watchlist
          country
          activeContractsCount
          totalExposure
          createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export default function TenantCustomersPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const { data: tenantData } = useQuery(TENANT_QUERY, { variables: { id: tenantId } });
  const { data: customersData, loading } = useQuery(CUSTOMERS_QUERY, {
    variables: {
      pagination: { first: 50 },
      tenantId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
  });

  const tenantName = tenantData?.tenant?.name || 'Tenant';
  const customers = customersData?.customers?.edges?.map((e: any) => e.node) || [];
  const filteredCustomers = customers.filter((c: any) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (c.fullName && c.fullName.toLowerCase().includes(term)) ||
      (c.externalId && c.externalId.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-8 animate-enter">
      <Link href={`/tenants/${tenantId}`} className="inline-flex items-center text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to {tenantName}
      </Link>

      <header className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Customers — {tenantName}</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input px-3 py-1.5 text-sm w-64"
          />
          <select
            className="glass-input px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-[color:var(--text-secondary)]">Loading customers...</div>
      ) : (
        <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <DataTable
            columns={[
              { header: 'Name', accessor: 'fullName' },
              { header: 'External ID', accessor: 'externalId' },
              { header: 'Phone', accessor: 'phonePrimary' },
              { header: 'KYC', accessor: (r: any) => <span className="uppercase text-xs">{r.kycLevel || '—'}</span> },
              { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
              {
                header: 'Watchlist',
                accessor: (r: any) => r.watchlist
                  ? <span className="text-[color:var(--status-error-text)] text-xs font-medium">FLAGGED</span>
                  : <span className="text-[color:var(--text-tertiary)] text-xs">Clear</span>,
              },
              { header: 'Active Contracts', accessor: (r: any) => <span className="tabular-nums">{r.activeContractsCount ?? 0}</span> },
              { header: 'Total Exposure', accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalExposure ?? '0', 'GHS')}</span> },
              { header: 'Country', accessor: 'country' },
              { header: 'Created', accessor: (r: any) => formatDate(r.createdAt) },
            ]}
            data={filteredCustomers}
            emptyMessage="No customers found for this tenant"
          />
        </div>
      )}
    </div>
  );
}
