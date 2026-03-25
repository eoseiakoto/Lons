'use client';

import { gql, useQuery, useMutation } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';

const CUSTOMER_QUERY = gql`
  query Customer($id: ID!) {
    customer(id: $id) {
      id externalId externalSource fullName gender country region city
      nationalId phonePrimary email kycLevel status blacklistReason watchlist
      createdAt updatedAt
    }
  }
`;

const BLACKLIST = gql`mutation Blacklist($id: ID!, $reason: String!) { addToBlacklist(customerId: $id, reason: $reason) { id status } }`;
const UNBLACKLIST = gql`mutation Unblacklist($id: ID!) { removeFromBlacklist(customerId: $id) { id status } }`;

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data, loading, refetch } = useQuery(CUSTOMER_QUERY, { variables: { id } });
  const [blacklist] = useMutation(BLACKLIST);
  const [unblacklist] = useMutation(UNBLACKLIST);
  const [tab, setTab] = useState<'profile' | 'contracts'>('profile');

  if (loading) return <div className="text-white/40">Loading...</div>;
  const customer = data?.customer;
  if (!customer) return <div className="text-white/40">Customer not found</div>;

  const handleBlacklist = async () => {
    const reason = prompt('Enter blacklist reason:');
    if (reason) { await blacklist({ variables: { id, reason } }); refetch(); }
  };

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-blue-400 mb-4 hover:underline">&larr; Back</button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{customer.fullName || customer.externalId}</h1>
          <p className="text-white/40">{customer.externalId} ({customer.externalSource})</p>
        </div>
        <div className="flex items-center space-x-3">
          <StatusBadge status={customer.status} />
          {customer.status !== 'blacklisted' ? (
            <button onClick={handleBlacklist} className="px-3 py-1.5 bg-red-500/80 border border-red-400/30 text-white rounded-lg text-sm hover:bg-red-500/90 transition-all">Blacklist</button>
          ) : (
            <button onClick={() => { unblacklist({ variables: { id } }); refetch(); }} className="px-3 py-1.5 bg-emerald-500/80 border border-emerald-400/30 text-white rounded-lg text-sm hover:bg-emerald-500/90 transition-all">Remove Blacklist</button>
          )}
        </div>
      </div>

      <div className="flex space-x-1 mb-4 border-b border-white/10">
        {(['profile', 'contracts'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-400 text-blue-400' : 'border-transparent text-white/40 hover:text-white/60'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="glass p-6">
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              ['Gender', customer.gender], ['Phone', customer.phonePrimary], ['Email', customer.email],
              ['National ID', customer.nationalId], ['KYC Level', customer.kycLevel?.replace(/_/g, ' ')],
              ['Country', customer.country], ['Region', customer.region], ['City', customer.city],
              ['Watchlist', customer.watchlist ? 'Yes' : 'No'],
              ['Created', formatDate(customer.createdAt)], ['Updated', formatDate(customer.updatedAt)],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs font-medium text-white/40 uppercase">{label}</dt>
                <dd className="text-sm text-white mt-1">{String(value ?? '-')}</dd>
              </div>
            ))}
            {customer.blacklistReason && (
              <div className="col-span-3">
                <dt className="text-xs font-medium text-red-400 uppercase">Blacklist Reason</dt>
                <dd className="text-sm text-red-400 mt-1">{customer.blacklistReason}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {tab === 'contracts' && (
        <div className="glass p-6 text-white/40">Contract list will load from contracts query filtered by customer ID.</div>
      )}
    </div>
  );
}
