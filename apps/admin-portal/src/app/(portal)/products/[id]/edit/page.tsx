'use client';

import { gql, useQuery } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { ProductWizard, type ProductFormState } from '@/components/products/wizard/product-wizard';

const PRODUCT_QUERY = gql`
  query Product($id: ID!) {
    product(id: $id) {
      id code name description type currency status version
      minAmount maxAmount minTenorDays maxTenorDays
      interestRate interestRateModel repaymentMethod
      gracePeriodDays approvalWorkflow maxActiveLoans
    }
  }
`;

function mapProductToForm(product: any): Partial<ProductFormState> {
  return {
    code: product.code || '',
    name: product.name || '',
    description: product.description || '',
    type: (product.type || 'micro_loan').toUpperCase(),
    currency: product.currency || 'GHS',
    minAmount: product.minAmount ? String(product.minAmount) : '',
    maxAmount: product.maxAmount ? String(product.maxAmount) : '',
    minTenorDays: product.minTenorDays ? String(product.minTenorDays) : '',
    maxTenorDays: product.maxTenorDays ? String(product.maxTenorDays) : '',
    interestRateModel: (product.interestRateModel || 'flat').toUpperCase(),
    interestRate: product.interestRate ? String(product.interestRate) : '',
    repaymentMethod: (product.repaymentMethod || 'equal_installment').toUpperCase().replace(/S$/, ''),
    gracePeriodDays: String(product.gracePeriodDays || 0),
    approvalWorkflow: (product.approvalWorkflow || 'auto').toUpperCase(),
    maxActiveLoans: String(product.maxActiveLoans || 1),
  };
}

export default function EditProductPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data, loading } = useQuery(PRODUCT_QUERY, { variables: { id } });

  if (loading) {
    return <div className="text-white/40">Loading product...</div>;
  }

  const product = data?.product;
  if (!product) {
    return <div className="text-white/40">Product not found</div>;
  }

  const initialData = mapProductToForm(product);

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-blue-400 mb-4 hover:underline">
        &larr; Back
      </button>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-white">Edit Product</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/60 border border-white/10">
          v{product.version || 1}
        </span>
      </div>
      <ProductWizard
        mode="edit"
        productId={id as string}
        initialData={initialData}
      />
    </div>
  );
}
