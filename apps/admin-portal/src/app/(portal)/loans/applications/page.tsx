'use client';

import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate } from '@/lib/utils';

const LOAN_REQUESTS_QUERY = gql`
  query LoanRequests($pagination: PaginationInput, $status: String) {
    loanRequests(pagination: $pagination, status: $status) {
      edges {
        node { id customerId productId requestedAmount currency status channel createdAt }
      }
      pageInfo { hasNextPage }
    }
  }
`;

export default function ApplicationsPage() {
  
  const { data, loading } = useQuery(LOAN_REQUESTS_QUERY, {
    variables: { pagination: { first: 50 }, status: 'manual_review' },
  });
  const requests = data?.loanRequests?.edges?.map((e: any) => e.node) || [];

  return (
    <div>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Application Queue</h1>
      <p className="text-white/40 mb-4">Loan requests pending manual review</p>
      {loading ? <div className="text-white/40">Loading...</div> : (
        <div className="glass overflow-hidden">
          <DataTable
            columns={[
              { header: 'Request ID', accessor: (r: any) => r.id.slice(0, 8) + '...' },
              { header: 'Amount', accessor: (r: any) => formatMoney(r.requestedAmount, r.currency) },
              { header: 'Channel', accessor: 'channel' },
              { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
              { header: 'Created', accessor: (r: any) => formatDate(r.createdAt) },
            ]}
            data={requests}
            emptyMessage="No applications pending review"
          />
        </div>
      )}
    </div>
  );
}
