'use client';

import { gql, useQuery } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';

const CONTRACT_QUERY = gql`
  query Contract($id: ID!) {
    contract(id: $id) {
      id contractNumber customerId productId lenderId currency
      principalAmount interestRate interestAmount totalFees totalCostCredit
      outstandingPrincipal outstandingInterest outstandingFees outstandingPenalties
      totalOutstanding totalPaid daysPastDue tenorDays
      status classification repaymentMethod
      startDate maturityDate createdAt
    }
    repaymentSchedule(contractId: $id) {
      id installmentNumber dueDate principalAmount interestAmount feeAmount
      totalAmount paidAmount status paidAt
    }
  }
`;

export default function ContractDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data, loading } = useQuery(CONTRACT_QUERY, { variables: { id } });

  if (loading) return <div className="text-white/40">Loading...</div>;
  const contract = data?.contract;
  const schedule = data?.repaymentSchedule || [];
  if (!contract) return <div className="text-white/40">Contract not found</div>;

  const c = contract;

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-blue-400 mb-4 hover:underline">&larr; Back</button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{c.contractNumber}</h1>
        <div className="flex items-center space-x-2">
          <StatusBadge status={c.status} />
          <StatusBadge status={c.classification} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass p-6">
          <h2 className="text-lg font-semibold text-white/80 mb-4">Contract Terms</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Principal', formatMoney(c.principalAmount, c.currency)],
              ['Interest Rate', `${c.interestRate}%`],
              ['Total Interest', formatMoney(c.interestAmount || '0', c.currency)],
              ['Total Fees', formatMoney(c.totalFees || '0', c.currency)],
              ['Total Cost', formatMoney(c.totalCostCredit || '0', c.currency)],
              ['Tenor', `${c.tenorDays} days`],
              ['Method', c.repaymentMethod?.replace(/_/g, ' ')],
              ['Start', formatDate(c.startDate)],
              ['Maturity', formatDate(c.maturityDate)],
              ['DPD', c.daysPastDue],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs text-white/40 uppercase">{label}</dt>
                <dd className="font-medium text-white">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="glass p-6">
          <h2 className="text-lg font-semibold text-white/80 mb-4">Outstanding Balances</h2>
          <dl className="space-y-3 text-sm">
            {[
              ['Principal', c.outstandingPrincipal],
              ['Interest', c.outstandingInterest],
              ['Fees', c.outstandingFees],
              ['Penalties', c.outstandingPenalties],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between">
                <dt className="text-white/40">{label}</dt>
                <dd className="font-medium text-white">{formatMoney(val || '0', c.currency)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-white/10 pt-3 font-bold">
              <dt className="text-white">Total Outstanding</dt>
              <dd className="text-red-400">{formatMoney(c.totalOutstanding || '0', c.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-white/40">Total Paid</dt>
              <dd className="text-green-400 font-medium">{formatMoney(c.totalPaid || '0', c.currency)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="glass p-6 overflow-hidden">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Repayment Schedule</h2>
        <DataTable
          columns={[
            { header: '#', accessor: 'installmentNumber' },
            { header: 'Due Date', accessor: (r: any) => formatDate(r.dueDate) },
            { header: 'Principal', accessor: (r: any) => formatMoney(r.principalAmount || '0', c.currency) },
            { header: 'Interest', accessor: (r: any) => formatMoney(r.interestAmount || '0', c.currency) },
            { header: 'Total', accessor: (r: any) => formatMoney(r.totalAmount, c.currency) },
            { header: 'Paid', accessor: (r: any) => formatMoney(r.paidAmount, c.currency) },
            { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
          ]}
          data={schedule}
        />
      </div>
    </div>
  );
}
