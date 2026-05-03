'use client';

import { gql, useQuery } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { ProductWizard, type ProductFormState } from '@/components/products/wizard/product-wizard';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';

const PRODUCT_QUERY = gql`
  query Product($id: ID!) {
    product(id: $id) {
      id code name description type currency status version
      minAmount maxAmount minTenorDays maxTenorDays
      interestRate interestRateModel repaymentMethod
      gracePeriodDays approvalWorkflow maxActiveLoans
      feeStructure
      eligibilityRules
      approvalThresholds
    }
  }
`;

function mapFee(fee: any, fallbackType: 'FLAT' | 'PERCENTAGE' = 'PERCENTAGE'): { type: 'FLAT' | 'PERCENTAGE'; amount: string } {
  if (!fee) return { type: fallbackType, amount: '' };
  return {
    type: (fee.type || fallbackType).toUpperCase() as 'FLAT' | 'PERCENTAGE',
    amount: fee.amount ? String(fee.amount) : '',
  };
}

// Prisma enum → frontend UI value mappings
const DB_TYPE_TO_UI: Record<string, string> = {
  overdraft: 'OVERDRAFT',
  micro_loan: 'MICRO_LOAN',
  bnpl: 'BNPL',
  invoice_financing: 'INVOICE_FACTORING',
};
const DB_REPAYMENT_TO_UI: Record<string, string> = {
  equal_installments: 'EQUAL_INSTALLMENT',
  lump_sum: 'BULLET',
  reducing: 'INTEREST_ONLY',
  balloon: 'BALLOON',
  auto_deduction: 'AUTO_DEDUCTION',
};
const DB_INTEREST_TO_UI: Record<string, string> = {
  flat: 'FLAT',
  reducing_balance: 'REDUCING_BALANCE',
  tiered: 'TIERED',
};
const DB_WORKFLOW_TO_UI: Record<string, string> = {
  auto: 'AUTO',
  semi_auto: 'MANUAL',
  single_level: 'HYBRID',
  multi_level: 'HYBRID',
};

function mapProductToForm(product: any): Partial<ProductFormState> {
  const fees = product.feeStructure || {};
  const eligibility = product.eligibilityRules || {};
  const thresholds = product.approvalThresholds || {};

  return {
    code: product.code || '',
    name: product.name || '',
    description: product.description || '',
    type: DB_TYPE_TO_UI[product.type] || (product.type || 'micro_loan').toUpperCase(),
    currency: product.currency || 'GHS',
    minAmount: product.minAmount ? String(product.minAmount) : '',
    maxAmount: product.maxAmount ? String(product.maxAmount) : '',
    minTenorDays: product.minTenorDays ? String(product.minTenorDays) : '',
    maxTenorDays: product.maxTenorDays ? String(product.maxTenorDays) : '',
    interestRateModel: DB_INTEREST_TO_UI[product.interestRateModel] || (product.interestRateModel || 'flat').toUpperCase(),
    interestRate: product.interestRate ? String(product.interestRate) : '',
    repaymentMethod: DB_REPAYMENT_TO_UI[product.repaymentMethod] || (product.repaymentMethod || 'equal_installments').toUpperCase(),
    gracePeriodDays: String(product.gracePeriodDays || 0),
    approvalWorkflow: DB_WORKFLOW_TO_UI[product.approvalWorkflow] || (product.approvalWorkflow || 'auto').toUpperCase(),
    maxActiveLoans: String(product.maxActiveLoans || 1),
    // From eligibilityRules JSON
    minCreditScore: eligibility.minCreditScore ? String(eligibility.minCreditScore) : '',
    minKycLevel: String(eligibility.minKycLevel || 1),
    customRules: eligibility.customRules ? JSON.stringify(eligibility.customRules, null, 2) : '',
    // From approvalThresholds JSON
    autoApproveThreshold: thresholds.autoApproveThreshold ? String(thresholds.autoApproveThreshold) : '',
    slaHours: thresholds.slaHours ? String(thresholds.slaHours) : '24',
    // From feeStructure JSON
    originationFee: mapFee(fees.originationFee, 'PERCENTAGE'),
    serviceFee: mapFee(fees.serviceFee, 'PERCENTAGE'),
    latePenalty: mapFee(fees.latePenalty, 'FLAT'),
    insurance: mapFee(fees.insurance, 'PERCENTAGE'),
  };
}

export default function EditProductPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { data, loading } = useQuery(PRODUCT_QUERY, { variables: { id } });

  if (loading) {
    return <div className="text-sm text-[color:var(--text-secondary)]">{t('common.loading')}</div>;
  }

  const product = data?.product;
  if (!product) {
    return <div className="text-sm text-[color:var(--text-secondary)]">{t('products.notFound')}</div>;
  }

  const initialData = mapProductToForm(product);

  return (
    <div className="relative space-y-6 animate-enter">
      <PageBackdrop />

      <button
        onClick={() => router.back()}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      <header className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="live-dot" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
            Edit · v{product.version}
          </span>
        </div>
        <h1
          className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
          style={{ fontSize: 44, lineHeight: 1.05 }}
        >
          {product.name}
        </h1>
        <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
          {t('products.wizard.editProduct')} — changes are versioned automatically.
        </p>
      </header>

      <div className="relative z-10">
        <ProductWizard
          mode="edit"
          productId={id as string}
          initialData={initialData}
        />
      </div>
    </div>
  );
}
