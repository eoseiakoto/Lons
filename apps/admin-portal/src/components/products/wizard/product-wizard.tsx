'use client';

import { useState, useCallback } from 'react';
import { gql, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { WizardProgress } from './wizard-progress';
import { StepBasicInfo } from './step-basic-info';
import { StepFinancialTerms } from './step-financial-terms';
import { StepFees } from './step-fees';
import { StepEligibility } from './step-eligibility';
import { StepApproval } from './step-approval';
import { StepNotifications } from './step-notifications';
import { StepReview } from './step-review';

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
  originationFee: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  serviceFee: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  latePenalty: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  insurance: { type: 'FLAT' | 'PERCENTAGE'; amount: string };
  minCreditScore: string;
  minKycLevel: string;
  maxActiveLoans: string;
  customRules: string;
  approvalWorkflow: string;
  autoApproveThreshold: string;
  slaHours: string;
  notifications: { event: string; channel: 'SMS' | 'EMAIL'; template: string }[];
}

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
  originationFee: { type: 'PERCENTAGE', amount: '' },
  serviceFee: { type: 'PERCENTAGE', amount: '' },
  latePenalty: { type: 'FLAT', amount: '' },
  insurance: { type: 'PERCENTAGE', amount: '' },
  minCreditScore: '',
  minKycLevel: '1',
  maxActiveLoans: '1',
  customRules: '',
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

function buildMutationInput(form: ProductFormState) {
  return {
    code: form.code,
    name: form.name,
    description: form.description || undefined,
    type: form.type.toLowerCase(),
    currency: form.currency,
    minAmount: form.minAmount ? Number(form.minAmount) : undefined,
    maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
    minTenorDays: form.minTenorDays ? Number(form.minTenorDays) : undefined,
    maxTenorDays: form.maxTenorDays ? Number(form.maxTenorDays) : undefined,
    interestRateModel: form.interestRateModel.toLowerCase(),
    interestRate: form.interestRate ? Number(form.interestRate) : undefined,
    repaymentMethod: form.repaymentMethod.toLowerCase(),
    gracePeriodDays: Number(form.gracePeriodDays) || 0,
    approvalWorkflow: form.approvalWorkflow.toLowerCase(),
    maxActiveLoans: Number(form.maxActiveLoans) || 1,
  };
}

export function ProductWizard({ initialData, productId, mode = 'create' }: ProductWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<ProductFormState>({
    ...DEFAULT_STATE,
    ...initialData,
  });

  const [createProduct, { loading: creating }] = useMutation(CREATE_PRODUCT);
  const [updateProduct, { loading: updating }] = useMutation(UPDATE_PRODUCT);
  const [activateProduct, { loading: activating }] = useMutation(ACTIVATE_PRODUCT);

  const saving = creating || updating || activating;

  const updateForm = useCallback((updates: Partial<ProductFormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 7) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep(step);
    }
  };

  const handleNext = () => {
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    setCurrentStep((s) => Math.min(s + 1, 7));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const handleSaveDraft = async () => {
    try {
      if (mode === 'edit' && productId) {
        await updateProduct({
          variables: { id: productId, input: buildMutationInput(form) },
        });
        toast('success', 'Product updated successfully');
      } else {
        const { data } = await createProduct({
          variables: { input: buildMutationInput(form) },
        });
        toast('success', 'Product saved as draft');
        if (data?.createProduct?.id) {
          router.push(`/products/${data.createProduct.id}`);
          return;
        }
      }
      router.push('/products');
    } catch (err: any) {
      toast('error', err.message || 'Failed to save product');
    }
  };

  const handleActivate = async () => {
    try {
      let id = productId;
      if (mode === 'create') {
        const { data } = await createProduct({
          variables: { input: buildMutationInput(form) },
        });
        id = data?.createProduct?.id;
      } else if (productId) {
        await updateProduct({
          variables: { id: productId, input: buildMutationInput(form) },
        });
      }
      if (id) {
        await activateProduct({ variables: { id } });
        toast('success', 'Product activated successfully');
        router.push(`/products/${id}`);
      }
    } catch (err: any) {
      toast('error', err.message || 'Failed to activate product');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepBasicInfo
            data={{ code: form.code, name: form.name, description: form.description, type: form.type, currency: form.currency }}
            onChange={updateForm}
          />
        );
      case 2:
        return (
          <StepFinancialTerms
            data={{
              minAmount: form.minAmount, maxAmount: form.maxAmount,
              minTenorDays: form.minTenorDays, maxTenorDays: form.maxTenorDays,
              interestRateModel: form.interestRateModel, interestRate: form.interestRate,
              repaymentMethod: form.repaymentMethod, gracePeriodDays: form.gracePeriodDays,
            }}
            currency={form.currency}
            onChange={updateForm}
          />
        );
      case 3:
        return (
          <StepFees
            data={{
              originationFee: form.originationFee, serviceFee: form.serviceFee,
              latePenalty: form.latePenalty, insurance: form.insurance,
            }}
            currency={form.currency}
            onChange={updateForm}
          />
        );
      case 4:
        return (
          <StepEligibility
            data={{
              minCreditScore: form.minCreditScore, minKycLevel: form.minKycLevel,
              maxActiveLoans: form.maxActiveLoans, customRules: form.customRules,
            }}
            onChange={updateForm}
          />
        );
      case 5:
        return (
          <StepApproval
            data={{
              approvalWorkflow: form.approvalWorkflow,
              autoApproveThreshold: form.autoApproveThreshold,
              slaHours: form.slaHours,
            }}
            onChange={updateForm}
          />
        );
      case 6:
        return (
          <StepNotifications
            data={{ notifications: form.notifications }}
            onChange={updateForm}
          />
        );
      case 7:
        return <StepReview data={form} />;
      default:
        return null;
    }
  };

  return (
    <div>
      <WizardProgress
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={goToStep}
      />

      <div className="glass p-6">
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
              Back
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || !form.code || !form.name}
            className="glass-button text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>

          {currentStep < 7 ? (
            <button
              type="button"
              onClick={handleNext}
              className="glass-button-primary text-sm"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleActivate}
              disabled={saving || !form.code || !form.name}
              className="px-4 py-2 bg-emerald-500/80 border border-emerald-400/30 text-white rounded-lg text-sm hover:bg-emerald-500/90 transition-all disabled:opacity-50"
            >
              {saving ? 'Activating...' : 'Activate Product'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
