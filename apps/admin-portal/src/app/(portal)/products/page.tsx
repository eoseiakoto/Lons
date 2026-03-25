'use client';

import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';

const PRODUCTS_QUERY = gql`
  query Products($pagination: PaginationInput) {
    products(pagination: $pagination) {
      edges {
        node {
          id
          code
          name
          type
          currency
          status
          interestRate
          maxActiveLoans
          version
          createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export default function ProductsPage() {
  const router = useRouter();
  const { data, loading } = useQuery(PRODUCTS_QUERY, { variables: { pagination: { first: 50 } } });

  const products = data?.products?.edges?.map((e: any) => e.node) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white/80">Products</h1>
        <button
          onClick={() => router.push('/products/new')}
          className="glass-button-primary text-sm"
        >
          Create Product
        </button>
      </div>

      {loading ? (
        <div className="text-white/40">Loading products...</div>
      ) : (
        <div className="glass overflow-hidden">
          <DataTable
            columns={[
              { header: 'Code', accessor: 'code' },
              { header: 'Name', accessor: 'name' },
              { header: 'Type', accessor: (row: any) => row.type.replace(/_/g, ' ') },
              { header: 'Currency', accessor: 'currency' },
              { header: 'Interest Rate', accessor: (row: any) => `${row.interestRate || 0}%` },
              { header: 'Status', accessor: (row: any) => <StatusBadge status={row.status} /> },
              { header: 'Version', accessor: 'version' },
              { header: 'Created', accessor: (row: any) => formatDate(row.createdAt) },
            ]}
            data={products}
            onRowClick={(row: any) => router.push(`/products/${row.id}`)}
          />
        </div>
      )}
    </div>
  );
}
