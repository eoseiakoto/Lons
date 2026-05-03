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

const CONTRACTS_QUERY = gql`
  query Contracts($pagination: PaginationInput, $status: String, $tenantId: ID) {
    contracts(pagination: $pagination, status: $status, tenantId: $tenantId) {
      edges {
        node {
          id
          contractNumber
          customerId
          productId
          currency
          principalAmount
          totalOutstanding
          daysPastDue
          status
          classification
          repaymentMethod
          startDate
          maturityDate
          createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export default function TenantContractsPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const [statusFilter, setStatusFilter] = useState('');
  const { data: tenantData } = useQuery(TENANT_QUERY, { variables: { id: tenantId } });
  const { data: contractsData, loading } = useQuery(CONTRACTS_QUERY, {
    variables: {
      pagination: { first: 50 },
      tenantId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
  });

  const tenantName = tenantData?.tenant?.name || 'Tenant';
  const contracts = contractsData?.contracts?.edges?.map((e: any) => e.node) || [];

  return (
    <div className="space-y-8 animate-enter">
      <Link href={`/tenants/${tenantId}`} className="inline-flex items-center text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to {tenantName}
      </Link>

      <header className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Contracts — {tenantName}</h1>
        <select
          className="glass-input px-3 py-1.5 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="performing">Performing</option>
          <option value="due">Due</option>
          <option value="overdue">Overdue</option>
          <option value="delinquent">Delinquent</option>
          <option value="default_status">Default</option>
          <option value="settled">Settled</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </header>

      {loading ? (
        <div className="text-sm text-[color:var(--text-secondary)]">Loading contracts...</div>
      ) : (
        <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <DataTable
            columns={[
              { header: 'Contract #', accessor: 'contractNumber' },
              { header: 'Principal', accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.principalAmount, r.currency)}</span> },
              { header: 'Outstanding', accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalOutstanding, r.currency)}</span> },
              { header: 'DPD', accessor: (r: any) => {
                const dpd = r.daysPastDue || 0;
                const color = dpd === 0 ? 'text-[color:var(--text-secondary)]' : dpd <= 30 ? 'text-[color:var(--status-warning-text)]' : 'text-[color:var(--status-error-text)]';
                return <span className={`font-medium ${color}`}>{dpd}</span>;
              }},
              { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
              { header: 'Classification', accessor: (r: any) => <StatusBadge status={r.classification} /> },
              { header: 'Start', accessor: (r: any) => formatDate(r.startDate) },
              { header: 'Maturity', accessor: (r: any) => formatDate(r.maturityDate) },
            ]}
            data={contracts}
            emptyMessage="No contracts found for this tenant"
          />
        </div>
      )}
    </div>
  );
}
