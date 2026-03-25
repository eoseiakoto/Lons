'use client';

import { gql, useQuery, useMutation } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate } from '@/lib/utils';

const PRODUCT_QUERY = gql`
  query Product($id: ID!) {
    product(id: $id) {
      id code name description type currency status version
      minAmount maxAmount minTenorDays maxTenorDays
      interestRate interestRateModel repaymentMethod
      gracePeriodDays approvalWorkflow maxActiveLoans
      activatedAt createdAt updatedAt
      lender { id name }
    }
  }
`;

const ACTIVATE_PRODUCT = gql`
  mutation ActivateProduct($id: ID!) { activateProduct(id: $id) { id status } }
`;

const SUSPEND_PRODUCT = gql`
  mutation SuspendProduct($id: ID!) { suspendProduct(id: $id) { id status } }
`;

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data, loading, refetch } = useQuery(PRODUCT_QUERY, { variables: { id } });
  const [activate] = useMutation(ACTIVATE_PRODUCT);
  const [suspend] = useMutation(SUSPEND_PRODUCT);

  if (loading) return <div className="text-white/40">Loading...</div>;
  const product = data?.product;
  if (!product) return <div className="text-white/40">Product not found</div>;

  const handleActivate = async () => { await activate({ variables: { id } }); refetch(); };
  const handleSuspend = async () => { await suspend({ variables: { id } }); refetch(); };

  const fields = [
    ['Code', product.code], ['Type', product.type.replace(/_/g, ' ')], ['Currency', product.currency],
    ['Min Amount', product.minAmount ? formatMoney(product.minAmount, product.currency) : '-'],
    ['Max Amount', product.maxAmount ? formatMoney(product.maxAmount, product.currency) : '-'],
    ['Interest Rate', `${product.interestRate || 0}%`], ['Interest Model', product.interestRateModel?.replace(/_/g, ' ')],
    ['Repayment Method', product.repaymentMethod?.replace(/_/g, ' ')],
    ['Grace Period', `${product.gracePeriodDays} days`], ['Approval Workflow', product.approvalWorkflow],
    ['Max Active Loans', product.maxActiveLoans], ['Version', product.version],
    ['Lender', product.lender?.name || '-'],
    ['Created', formatDate(product.createdAt)], ['Activated', product.activatedAt ? formatDate(product.activatedAt) : '-'],
  ];

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-blue-400 mb-4 hover:underline">&larr; Back</button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{product.name}</h1>
          <p className="text-white/40 mt-1">{product.description}</p>
        </div>
        <div className="flex items-center space-x-3">
          <StatusBadge status={product.status} />
          {product.status === 'draft' && (
            <button onClick={handleActivate} className="px-3 py-1.5 bg-emerald-500/80 border border-emerald-400/30 text-white rounded-lg text-sm hover:bg-emerald-500/90 transition-all">Activate</button>
          )}
          {product.status === 'active' && (
            <button onClick={handleSuspend} className="px-3 py-1.5 bg-amber-500/80 border border-amber-400/30 text-white rounded-lg text-sm hover:bg-amber-500/90 transition-all">Suspend</button>
          )}
        </div>
      </div>
      <div className="glass p-6">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Product Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {fields.map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs font-medium text-white/40 uppercase">{label}</dt>
              <dd className="text-sm text-white mt-1">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
