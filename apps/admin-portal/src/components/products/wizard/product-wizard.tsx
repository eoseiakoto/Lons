'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { gql, useMutation, useQuery, useApolloClient } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/i18n-context';
import { WizardProgress } from './wizard-progress';
import { StepBasicInfo } from './step-basic-info';
import { StepFinancialTerms } from './step-financial-terms';
import { StepFees } from './step-fees';
import { StepEligibility } from './step-eligibility';
import { StepFundingSource } from './step-funding-source';
import { StepFactoringConfig, type FactoringConfigData } from './step-factoring-config';
import { StepApproval } from './step-approval';
import { StepNotifications } from './step-notifications';
import { StepReview } from './step-review';
import { validateStep, validateAllSteps, validateForActivation, validateNotifications, type FieldError, type StepValidationResult } from './validation';

const CREATE_PRODUCT = gql`
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
      id code name status
    }
  }
`;

const UPDATE_PRODUCT = gql`
  mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
    updateProduct(id: $id, input: $input) {
      id code name status
    }
  }
`;

const ACTIVATE_PRODUCT = gql`
  mutation ActivateProduct($id: ID!) {
    activateProduct(id: $id) {
      id status
    }
  }
`;

const NEXT_PRODUCT_CODE = gql`
  query NextProductCode($type: String!, $currency: String!) {
    nextProductCode(type: $type, currency: $currency)
  }
`;

export interface ProductFormState {
  code: string;
  name: string;
  description: string;
  type: string;
  currency: string;
  minAmount: string;
  maxAmount: string;
  minTenorDays: string;
  maxTenorDays: string;
  interestRateModel: string;
  interestRate: string;
  repaymentMethod: string;
  gracePeriodDays: string;
  coolingOffHours: string;
  originationFee: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  serviceFee: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  latePenalty: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  insurance: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  minCreditScore: string;
  minKycLevel: string;
  maxActiveLoans: string;
  customRules: string;
  lenderId: string;
  lenderName: string;
  insuranceEnabled: boolean;
  insuranceProvider: string;
  insurancePremiumRate: string;
  insuranceCoverageType: string;
  revenueSharing: {
    lenderSharePercent: string;
  };
  approvalWorkflow: string;
  autoApproveThreshold: string;
  slaHours: string;
  notifications: { event: string; channel: 'SMS' | 'EMAIL'; template: string }[];
  /** Invoice-factoring product configuration. Present only when type === 'INVOICE_FACTORING'. */
  factoringConfig?: FactoringConfigData;
}

/** Default factoring config used when productType becomes invoice_financing. */
const DEFAULT_FACTORING_CONFIG: FactoringConfigData = {
  advanceRateMin: '',
  advanceRateMax: '',
  advanceRateDefault: '',
  discountRateAnnual: '',
  serviceFeeFlat: '',
  defaultRecourseType: 'with_recourse',
  // F-IF-1: default offer validity matches the service-side default (48h).
  offerValidityHours: '48',
  nonRecourseEligibility: {
    minDebtorRiskScore: '',
    minDebtorPaymentHistory: '',
    maxInvoiceTenorDays: '',
    feeMultiplier: '',
  },
  verificationRules: {
    autoVerifyBelow: '',
    manualVerifyAbove: '',
    manualVerifyNewSeller: true,
    manualVerifyNewDebtor: true,
  },
  concentrationLimits: {
    maxDebtorExposurePercent: '',
    maxDebtorExposureAmount: '',
    maxIndustryExposurePercent: '',
    maxSellerDebtorPercent: '',
  },
  agingThresholds: {
    graceEndDpd: '',
    overdueEndDpd: '',
    seriouslyOverdueEndDpd: '',
    defaultDpd: '',
  },
  reserveRelease: {
    auto: true,
    manualReleaseAbove: '',
  },
};

const DEFAULT_STATE: ProductFormState = {
  code: '',
  name: '',
  description: '',
  type: 'MICRO_LOAN',
  currency: 'GHS',
  minAmount: '',
  maxAmount: '',
  minTenorDays: '',
  maxTenorDays: '',
  interestRateModel: 'FLAT',
  interestRate: '',
  repaymentMethod: 'EQUAL_INSTALLMENT',
  gracePeriodDays: '0',
  coolingOffHours: '0',
  originationFee: { type: 'PERCENTAGE', amount: '' },
  serviceFee: { type: 'PERCENTAGE', amount: '' },
  latePenalty: { type: 'FLAT', amount: '' },
  insurance: { type: 'PERCENTAGE', amount: '' },
  minCreditScore: '',
  minKycLevel: '1',
  maxActiveLoans: '1',
  customRules: '',
  lenderId: '',
  lenderName: '',
  insuranceEnabled: false,
  insuranceProvider: '',
  insurancePremiumRate: '',
  insuranceCoverageType: '',
  revenueSharing: {
    lenderSharePercent: '',
  },
  approvalWorkflow: 'AUTO',
  autoApproveThreshold: '',
  slaHours: '24',
  notifications: [
    { event: 'APPROVED', channel: 'SMS', template: '' },
    { event: 'DISBURSED', channel: 'SMS', template: '' },
  ],
};

interface ProductWizardProps {
  initialData?: Partial<ProductFormState>;
  productId?: string;
  mode?: 'create' | 'edit';
}

/** Logical step identifiers; numeric step → id depends on the active sequence. */
export type StepId =
  | 'basic-info'
  | 'financial-terms'
  | 'fees'
  | 'eligibility'
  | 'funding-source'
  | 'factoring-config'
  | 'approval'
  | 'notifications'
  | 'review';

const STEP_IDS_DEFAULT: StepId[] = [
  'basic-info',
  'financial-terms',
  'fees',
  'eligibility',
  'funding-source',
  'approval',
  'notifications',
  'review',
];

const STEP_IDS_FACTORING: StepId[] = [
  'basic-info',
  'financial-terms',
  'fees',
  'eligibility',
  'funding-source',
  'factoring-config',
  'approval',
  'notifications',
  'review',
];

function buildFeeEntry(fee: { type: 'FLAT' | 'PERCENTAGE'; amount: string }) {
  return { type: fee.type.toLowerCase(), amount: fee.amount ? Number(fee.amount) : 0 };
}

function buildMutationInput(form: ProductFormState, mode: 'create' | 'edit' = 'create', codeOverride?: string) {
  // Compose JSON structures that map to Prisma JSON columns
  const feeStructure = {
    originationFee: buildFeeEntry(form.originationFee),
    serviceFee: buildFeeEntry(form.serviceFee),
    latePenalty: buildFeeEntry(form.latePenalty),
    insurance: buildFeeEntry(form.insurance),
  };

  const eligibilityRules: Record<string, unknown> = {
    minCreditScore: form.minCreditScore ? Number(form.minCreditScore) : 0,
    minKycLevel: Number(form.minKycLevel) || 0,
    maxActiveLoans: Number(form.maxActiveLoans) || 1,
  };
  if (form.customRules && form.customRules.trim()) {
    try { eligibilityRules.customRules = JSON.parse(form.customRules); } catch { /* skip invalid */ }
  }

  const approvalThresholds: Record<string, unknown> = {
    autoApproveThreshold: form.autoApproveThreshold ? Number(form.autoApproveThreshold) : undefined,
    slaHours: form.slaHours ? Number(form.slaHours) : undefined,
  };

  const revenueSharing: Record<string, unknown> = {
    lenderSharePercent: form.revenueSharing.lenderSharePercent
      ? Number(form.revenueSharing.lenderSharePercent)
      : null,
    insuranceEnabled: form.insuranceEnabled,
    insuranceProvider: form.insuranceProvider || null,
    insurancePremiumRate: form.insurancePremiumRate ? Number(form.insurancePremiumRate) : null,
    insuranceCoverageType: form.insuranceCoverageType || null,
  };

  const base: Record<string, any> = {
    name: form.name,
    description: form.description || undefined,
    lenderId: form.lenderId || null,
    revenueSharing,
    minAmount: form.minAmount ? Number(form.minAmount) : undefined,
    maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
    minTenorDays: form.minTenorDays ? Number(form.minTenorDays) : undefined,
    maxTenorDays: form.maxTenorDays ? Number(form.maxTenorDays) : undefined,
    interestRate: form.interestRate ? Number(form.interestRate) : undefined,
    gracePeriodDays: Number(form.gracePeriodDays) || 0,
    coolingOffHours: Number(form.coolingOffHours) || 0,
    maxActiveLoans: Number(form.maxActiveLoans) || 1,
    feeStructure,
    eligibilityRules,
    approvalThresholds,
  };

  // Invoice-factoring product config — written to product.factoringConfig JSON.
  if (form.type === 'INVOICE_FACTORING' && form.factoringConfig) {
    const fc = form.factoringConfig;
    const numOrNull = (s: string) => (s && s.trim() !== '' ? Number(s) : null);
    const strOrNull = (s: string) => (s && s.trim() !== '' ? s.trim() : null);
    base.factoringConfig = {
      advanceRateMin: numOrNull(fc.advanceRateMin),
      advanceRateMax: numOrNull(fc.advanceRateMax),
      advanceRateDefault: numOrNull(fc.advanceRateDefault),
      discountRateAnnual: numOrNull(fc.discountRateAnnual),
      // Decimal-as-string for monetary amounts
      serviceFeeFlat: strOrNull(fc.serviceFeeFlat),
      defaultRecourseType: fc.defaultRecourseType,
      // F-IF-1: persisted as int hours so the service can multiply by 60*60*1000.
      offerValidityHours: numOrNull(fc.offerValidityHours),
      nonRecourseEligibility: {
        minDebtorRiskScore: numOrNull(fc.nonRecourseEligibility.minDebtorRiskScore),
        minDebtorPaymentHistory: numOrNull(fc.nonRecourseEligibility.minDebtorPaymentHistory),
        maxInvoiceTenorDays: numOrNull(fc.nonRecourseEligibility.maxInvoiceTenorDays),
        feeMultiplier: numOrNull(fc.nonRecourseEligibility.feeMultiplier),
      },
      verificationRules: {
        autoVerifyBelow: strOrNull(fc.verificationRules.autoVerifyBelow),
        manualVerifyAbove: strOrNull(fc.verificationRules.manualVerifyAbove),
        manualVerifyNewSeller: fc.verificationRules.manualVerifyNewSeller,
        manualVerifyNewDebtor: fc.verificationRules.manualVerifyNewDebtor,
      },
      concentrationLimits: {
        maxDebtorExposurePercent: numOrNull(fc.concentrationLimits.maxDebtorExposurePercent),
        maxDebtorExposureAmount: strOrNull(fc.concentrationLimits.maxDebtorExposureAmount),
        maxIndustryExposurePercent: numOrNull(fc.concentrationLimits.maxIndustryExposurePercent),
        maxSellerDebtorPercent: numOrNull(fc.concentrationLimits.maxSellerDebtorPercent),
      },
      agingThresholds: {
        graceEndDpd: numOrNull(fc.agingThresholds.graceEndDpd),
        overdueEndDpd: numOrNull(fc.agingThresholds.overdueEndDpd),
        seriouslyOverdueEndDpd: numOrNull(fc.agingThresholds.seriouslyOverdueEndDpd),
        defaultDpd: numOrNull(fc.agingThresholds.defaultDpd),
      },
      reserveRelease: {
        auto: fc.reserveRelease.auto,
        manualReleaseAbove: strOrNull(fc.reserveRelease.manualReleaseAbove),
      },
    };
  }

  // Map frontend UI enum values → Prisma enum values
  const TYPE_TO_DB: Record<string, string> = {
    OVERDRAFT: 'overdraft',
    MICRO_LOAN: 'micro_loan',
    BNPL: 'bnpl',
    INVOICE_FACTORING: 'invoice_financing',
  };
  const REPAYMENT_TO_DB: Record<string, string> = {
    EQUAL_INSTALLMENT: 'equal_installments',
    BULLET: 'lump_sum',
    INTEREST_ONLY: 'reducing',
    REDUCING: 'reducing',
    BALLOON: 'balloon',
    AUTO_DEDUCTION: 'auto_deduction',
  };
  const INTEREST_TO_DB: Record<string, string> = {
    FLAT: 'flat',
    REDUCING_BALANCE: 'reducing_balance',
    TIERED: 'tiered',
  };
  const WORKFLOW_TO_DB: Record<string, string> = {
    AUTO: 'auto',
    MANUAL: 'semi_auto',
    HYBRID: 'single_level',
  };

  // Immutable fields only sent on create
  if (mode === 'create') {
    base.code = codeOverride || form.code;
    base.type = TYPE_TO_DB[form.type] || form.type.toLowerCase();
    base.currency = form.currency;
    base.interestRateModel = INTEREST_TO_DB[form.interestRateModel] || form.interestRateModel.toLowerCase();
    base.repaymentMethod = REPAYMENT_TO_DB[form.repaymentMethod] || form.repaymentMethod.toLowerCase();
    base.approvalWorkflow = WORKFLOW_TO_DB[form.approvalWorkflow] || form.approvalWorkflow.toLowerCase();
  }

  return base;
}

/** Minimal validation for draft save — just needs a name */
function validateBasicInfoForDraft(form: ProductFormState): StepValidationResult {
  const errors: FieldError[] = [];
  if (!form.name.trim()) {
    errors.push({ field: 'name', messageKey: 'validation.required' });
  }
  return { valid: errors.length === 0, errors };
}

function scrollToFirstError() {
  requestAnimationFrame(() => {
    const firstError = document.querySelector('[data-field-error]');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = firstError.querySelector('input, select, textarea');
      if (input) (input as HTMLElement).focus();
    }
  });
}

export function ProductWizard({ initialData, productId, mode = 'create' }: ProductWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepErrors, setStepErrors] = useState<FieldError[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [activationErrors, setActivationErrors] = useState<FieldError[]>([]);
  const [form, setForm] = useState<ProductFormState>({
    ...DEFAULT_STATE,
    ...initialData,
  });

  // Auto-generate product code from backend in create mode
  const { data: codeData, loading: codeLoading, refetch: refetchCode } = useQuery(NEXT_PRODUCT_CODE, {
    variables: { type: form.type, currency: form.currency },
    skip: mode !== 'create' || !form.type || !form.currency,
    fetchPolicy: 'network-only',
  });

  // Refetch code when type or currency changes
  useEffect(() => {
    if (mode === 'create' && form.type && form.currency) {
      refetchCode({ type: form.type, currency: form.currency });
    }
  }, [form.type, form.currency, mode, refetchCode]);

  const codeReady = mode !== 'create' || !codeLoading;

  const generatedCode = useMemo(() => {
    if (mode !== 'create') return form.code;
    return codeData?.nextProductCode || '';
  }, [mode, form.code, codeData]);

  const [createProduct, { loading: creating }] = useMutation(CREATE_PRODUCT);
  const [updateProduct, { loading: updating }] = useMutation(UPDATE_PRODUCT);
  const [activateProduct, { loading: activating }] = useMutation(ACTIVATE_PRODUCT);

  const saving = creating || updating || activating;

  // Step sequence is dynamic: invoice-financing products have an extra
  // "factoring config" step inserted after Funding Source.
  const isFactoring = form.type === 'INVOICE_FACTORING';
  const stepIds = useMemo<StepId[]>(
    () => (isFactoring ? STEP_IDS_FACTORING : STEP_IDS_DEFAULT),
    [isFactoring],
  );
  const totalSteps = stepIds.length;

  // Ensure factoringConfig exists when type becomes invoice_financing.
  useEffect(() => {
    if (isFactoring && !form.factoringConfig) {
      setForm((prev) => ({ ...prev, factoringConfig: { ...DEFAULT_FACTORING_CONFIG } }));
    }
  }, [isFactoring, form.factoringConfig]);

  // Clamp current step if user changes type and shrinks the sequence.
  useEffect(() => {
    if (currentStep > totalSteps) setCurrentStep(totalSteps);
  }, [totalSteps, currentStep]);

  const updateForm = useCallback((updates: Partial<ProductFormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    // Clear errors as user edits — they'll be re-validated on Next
    if (showErrors) {
      setShowErrors(false);
      setStepErrors([]);
    }
    if (activationErrors.length > 0) {
      setActivationErrors([]);
    }
  }, [showErrors, activationErrors]);

  const currentStepId = stepIds[currentStep - 1];

  const goToStep = (step: number) => {
    if (step >= 1 && step <= totalSteps) {
      // Validate current step before allowing jump forward
      if (step > currentStep) {
        const result = validateStep(currentStepId, form);
        if (!result.valid) {
          setStepErrors(result.errors);
          setShowErrors(true);
          return;
        }
      }
      setStepErrors([]);
      setShowErrors(false);
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep(step);
    }
  };

  const handleNext = () => {
    const result = validateStep(currentStepId, form);
    if (!result.valid) {
      setStepErrors(result.errors);
      setShowErrors(true);
      scrollToFirstError();
      return;
    }
    setStepErrors([]);
    setShowErrors(false);
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    setCurrentStep((s) => Math.min(s + 1, totalSteps));
  };

  const handleBack = () => {
    setStepErrors([]);
    setShowErrors(false);
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const handleSaveDraft = async () => {
    if (mode === 'edit') {
      // Edit mode: validate ALL steps before saving changes
      const firstInvalid = validateAllSteps(form);
      if (firstInvalid) {
        setStepErrors(firstInvalid.result.errors);
        setShowErrors(true);
        const idx = stepIds.indexOf(firstInvalid.step);
        if (idx >= 0) setCurrentStep(idx + 1);
        scrollToFirstError();
        return;
      }
    } else {
      // Create mode: drafts require at minimum a product name
      const basicResult = validateBasicInfoForDraft(form);
      if (!basicResult.valid) {
        setStepErrors(basicResult.errors);
        setShowErrors(true);
        if (currentStep !== 1) setCurrentStep(1);
        scrollToFirstError();
        return;
      }

      // Also validate the current step to avoid saving bad partial data
      const currentResult = validateStep(currentStepId, form);
      if (!currentResult.valid) {
        setStepErrors(currentResult.errors);
        setShowErrors(true);
        scrollToFirstError();
        return;
      }
    }

    try {
      if (mode === 'edit' && productId) {
        await updateProduct({
          variables: { id: productId, input: buildMutationInput(form, 'edit') },
        });
        toast('success', t('products.updated'));
        router.push(`/products/${productId}`);
      } else {
        const { data } = await createProduct({
          variables: { input: buildMutationInput(form, 'create', generatedCode) },
        });
        toast('success', t('products.saveDraft'));
        if (data?.createProduct?.id) {
          router.push(`/products/${data.createProduct.id}`);
          return;
        }
        router.push('/products');
      }
    } catch (err: any) {
      toast('error', err.message || t('products.wizard.errors.saveFailed'));
    }
  };

  const apolloClient = useApolloClient();

  const handleActivate = async () => {
    // Full validation for activation
    const result = validateForActivation(form, generatedCode);
    if (!result.valid) {
      setActivationErrors(result.errors);
      setShowErrors(true);
      scrollToFirstError();
      return;
    }

    // Cross-step validation: interest rate vs lender bounds
    if (form.lenderId && form.interestRate) {
      try {
        const cachedLenders = apolloClient.readQuery<{
          lenders: { edges: { node: { id: string; minInterestRate?: number; maxInterestRate?: number } }[] };
        }>({
          query: gql`
            query ActiveLenders($pagination: PaginationInput) {
              lenders(pagination: $pagination) {
                edges { node { id name country minInterestRate maxInterestRate status } }
              }
            }
          `,
          variables: { pagination: { first: 100 } },
        });
        const lender = cachedLenders?.lenders?.edges?.find(
          (e) => e.node.id === form.lenderId,
        )?.node;
        if (lender) {
          const rate = Number(form.interestRate);
          if (lender.minInterestRate != null && lender.maxInterestRate != null) {
            if (rate < lender.minInterestRate || rate > lender.maxInterestRate) {
              setActivationErrors([{
                field: 'interestRate',
                messageKey: 'validation.interestRateOutsideLenderBounds',
                params: { rate, min: lender.minInterestRate, max: lender.maxInterestRate },
              }]);
              setShowErrors(true);
              scrollToFirstError();
              return;
            }
          }
        }
      } catch {
        // Cache miss — lender data not available, skip cross-validation
      }
    }

    setActivationErrors([]);

    try {
      let id = productId;
      if (mode === 'create') {
        const { data } = await createProduct({
          variables: { input: buildMutationInput(form, 'create', generatedCode) },
        });
        id = data?.createProduct?.id;
      } else if (productId) {
        await updateProduct({
          variables: { id: productId, input: buildMutationInput(form, 'edit') },
        });
      }
      if (id) {
        await activateProduct({ variables: { id } });
        toast('success', t('products.activateProduct'));
        router.push(`/products/${id}`);
      }
    } catch (err: any) {
      toast('error', err.message || t('products.wizard.errors.activateFailed'));
    }
  };

  const currentErrors = showErrors ? stepErrors : [];

  const renderStep = () => {
    switch (currentStepId) {
      case 'basic-info':
        return (
          <StepBasicInfo
            data={{ code: codeLoading ? '...' : generatedCode, name: form.name, description: form.description, type: form.type, currency: form.currency }}
            onChange={updateForm}
            mode={mode}
            errors={currentErrors}
          />
        );
      case 'financial-terms':
        return (
          <StepFinancialTerms
            data={{
              minAmount: form.minAmount, maxAmount: form.maxAmount,
              minTenorDays: form.minTenorDays, maxTenorDays: form.maxTenorDays,
              interestRateModel: form.interestRateModel, interestRate: form.interestRate,
              repaymentMethod: form.repaymentMethod, gracePeriodDays: form.gracePeriodDays,
              coolingOffHours: form.coolingOffHours,
            }}
            currency={form.currency}
            onChange={updateForm}
            errors={currentErrors}
          />
        );
      case 'fees':
        return (
          <StepFees
            data={{
              originationFee: form.originationFee, serviceFee: form.serviceFee,
              latePenalty: form.latePenalty, insurance: form.insurance,
            }}
            currency={form.currency}
            onChange={updateForm}
            errors={currentErrors}
          />
        );
      case 'eligibility':
        return (
          <StepEligibility
            data={{
              minCreditScore: form.minCreditScore, minKycLevel: form.minKycLevel,
              maxActiveLoans: form.maxActiveLoans, customRules: form.customRules,
            }}
            onChange={updateForm}
            errors={currentErrors}
          />
        );
      case 'funding-source':
        return (
          <StepFundingSource
            data={{
              lenderId: form.lenderId,
              lenderName: form.lenderName,
              insuranceEnabled: form.insuranceEnabled,
              insuranceProvider: form.insuranceProvider,
              insurancePremiumRate: form.insurancePremiumRate,
              insuranceCoverageType: form.insuranceCoverageType,
              revenueSharing: form.revenueSharing,
            }}
            onChange={updateForm}
            errors={currentErrors}
          />
        );
      case 'factoring-config':
        return (
          <StepFactoringConfig
            data={form.factoringConfig ?? DEFAULT_FACTORING_CONFIG}
            currency={form.currency}
            onChange={(updates) =>
              updateForm({
                factoringConfig: {
                  ...(form.factoringConfig ?? DEFAULT_FACTORING_CONFIG),
                  ...updates,
                } as FactoringConfigData,
              })
            }
            errors={currentErrors}
          />
        );
      case 'approval':
        return (
          <StepApproval
            data={{
              approvalWorkflow: form.approvalWorkflow,
              autoApproveThreshold: form.autoApproveThreshold,
              slaHours: form.slaHours,
            }}
            onChange={updateForm}
            errors={currentErrors}
          />
        );
      case 'notifications': {
        const notifResult = validateNotifications(form);
        return (
          <StepNotifications
            data={{ notifications: form.notifications }}
            onChange={updateForm}
            productId={productId}
            errors={currentErrors}
            warnings={notifResult.warnings}
          />
        );
      }
      case 'review':
        return (
          <StepReview
            data={{ ...form, code: generatedCode }}
            activationErrors={activationErrors}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <WizardProgress
        stepIds={stepIds}
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={goToStep}
        errorStep={showErrors && stepErrors.length > 0 ? currentStep : undefined}
      />

      <div className="card p-6">
        {renderStep()}
      </div>

      <div className="flex items-center justify-between mt-6">
        <div>
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="glass-button text-sm"
            >
              {t('common.back')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || !codeReady}
            className="glass-button text-sm disabled:opacity-50"
          >
            {saving
              ? t('common.saving')
              : !codeReady
                ? t('common.loading')
                : mode === 'edit'
                  ? t('products.wizard.saveChanges')
                  : t('products.wizard.saveAsDraft')
            }
          </button>

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={handleNext}
              className="glass-button-primary text-sm"
            >
              {t('common.next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleActivate}
              disabled={saving || !codeReady}
              className="px-4 py-2 bg-[color:var(--status-success)] border border-[color:var(--status-success)] text-white rounded-lg text-sm hover:bg-[color:var(--status-success)]/90 transition-all disabled:opacity-50"
            >
              {saving ? t('products.activating') : t('products.wizard.activateProduct')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
