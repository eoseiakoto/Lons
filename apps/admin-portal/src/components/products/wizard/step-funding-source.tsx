'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { LenderForm } from '@/components/lenders/lender-form';
import { FieldErrorMessage, StepErrorBanner, resolveError } from './field-error';
import { getFieldError, type FieldError } from './validation';

const ACTIVE_LENDERS = gql`
  query ActiveLenders($pagination: PaginationInput) {
    lenders(pagination: $pagination) {
      edges {
        node {
          id
          name
          country
          minInterestRate
          maxInterestRate
          status
        }
      }
    }
  }
`;

const MY_TENANT = gql`
  query MyTenant {
    myTenant {
      platformFeePercent
    }
  }
`;

interface StepFundingSourceProps {
  data: {
    lenderId: string;
    lenderName: string;
    insuranceEnabled: boolean;
    insuranceProvider: string;
    insurancePremiumRate: string;
    insuranceCoverageType: string;
    revenueSharing: {
      lenderSharePercent: string;
    };
  };
  onChange: (updates: Partial<StepFundingSourceProps['data']>) => void;
  errors?: FieldError[];
}

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

const COVERAGE_TYPES = [
  { value: '', labelKey: 'products.wizard.selectCoverageType' },
  { value: 'credit_life', labelKey: 'products.wizard.coverageCreditLife' },
  { value: 'repayment_protection', labelKey: 'products.wizard.coverageRepaymentProtection' },
  { value: 'full_cover', labelKey: 'products.wizard.coverageFullCover' },
];

const CREATE_LENDER = gql`
  mutation CreateLender($input: CreateLenderInput!) {
    createLender(input: $input) {
      id name country status
    }
  }
`;

export function StepFundingSource({ data, onChange, errors = [] }: StepFundingSourceProps) {
  const { t } = useI18n();
  const [showAddLender, setShowAddLender] = useState(false);

  const { data: lendersData, loading: lendersLoading, refetch: refetchLenders } = useQuery(ACTIVE_LENDERS, {
    variables: { pagination: { first: 100 } },
  });

  const { data: tenantData } = useQuery(MY_TENANT);
  const [createLender, { loading: creatingLender }] = useMutation(CREATE_LENDER);

  const activeLenders = (lendersData?.lenders?.edges ?? [])
    .map((e: { node: Record<string, unknown> }) => e.node)
    .filter((l: { status?: string; name?: string }) =>
      (l.status === 'active' || l.status === 'ACTIVE') && l.name !== 'Self-Funded'
    );

  const selectedLender = activeLenders.find(
    (l: { id: string }) => l.id === data.lenderId,
  );

  const platformFeePercent = tenantData?.myTenant?.platformFeePercent ?? 0;
  const lenderShare = data.revenueSharing.lenderSharePercent
    ? Number(data.revenueSharing.lenderSharePercent)
    : 0;
  const spShare = Math.max(0, 100 - Number(platformFeePercent) - lenderShare);

  const errorInputCls = 'ring-1 ring-red-500/50';
  const lenderShareErr = resolveError(getFieldError(errors, 'revenueSharing.lenderSharePercent'), t);
  const premiumRateErr = resolveError(getFieldError(errors, 'insurancePremiumRate'), t);
  const coverageTypeErr = resolveError(getFieldError(errors, 'insuranceCoverageType'), t);
  const providerErr = resolveError(getFieldError(errors, 'insuranceProvider'), t);

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.fundingSourceTitle')}</h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">{t('products.wizard.fundingSourceDesc')}</p>

      <StepErrorBanner message={t('validation.fixErrorsBeforeProceeding')} show={errors.length > 0} />

      {/* Lender Selection */}
      <div className="card p-4 space-y-4">
        <h4 className="section-label">
          {t('products.wizard.lenderSelection')}
        </h4>
        <div>
          <label className={labelCls}>{t('products.wizard.selectLender')}</label>
          <select
            className="w-full glass-input"
            value={data.lenderId}
            onChange={(e) => {
              const selectedId = e.target.value;
              const selectedName = activeLenders.find((l: { id: string }) => l.id === selectedId)?.name || '';
              onChange({ lenderId: selectedId, lenderName: selectedName } as Partial<StepFundingSourceProps['data']>);
            }}
          >
            <option value="">{t('products.wizard.selfFunded')}</option>
            {lendersLoading && <option disabled>{t('common.loading')}</option>}
            {activeLenders.map((lender: { id: string; name: string; country?: string; minInterestRate?: number; maxInterestRate?: number }) => (
              <option key={lender.id} value={lender.id}>
                {lender.name}
                {lender.country ? ` (${lender.country})` : ''}
                {lender.minInterestRate != null && lender.maxInterestRate != null
                  ? ` - ${lender.minInterestRate}%-${lender.maxInterestRate}%`
                  : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
            {data.lenderId
              ? t('products.wizard.lenderOptional')
              : t('products.wizard.selfFundedHint')}
          </p>
          <button
            type="button"
            onClick={() => setShowAddLender(true)}
            className="text-sm text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] mt-1 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            {t('products.wizard.addNewLender')}
          </button>
        </div>

        {selectedLender && (
          <div className="bg-[color:var(--bg-muted)] rounded-lg p-3 space-y-1">
            <p className="text-sm text-[color:var(--text-primary)] font-medium">{(selectedLender as { name: string }).name}</p>
            {(selectedLender as { country?: string }).country && (
              <p className="text-xs text-[color:var(--text-tertiary)]">
                {t('products.wizard.country')}: {(selectedLender as { country: string }).country}
              </p>
            )}
            {(selectedLender as { minInterestRate?: number }).minInterestRate != null && (
              <p className="text-xs text-[color:var(--text-tertiary)]">
                {t('products.wizard.interestRange')}: {(selectedLender as { minInterestRate: number }).minInterestRate}% - {(selectedLender as { maxInterestRate: number }).maxInterestRate}%
              </p>
            )}
          </div>
        )}
      </div>

      {/* Insurance Configuration */}
      <div className="card p-4 space-y-4">
        <h4 className="section-label">
          {t('products.wizard.insuranceConfig')}
        </h4>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.insuranceEnabled}
            onChange={(e) => onChange({ insuranceEnabled: e.target.checked })}
            className="accent-blue-500 w-4 h-4"
          />
          <span className="text-sm text-[color:var(--text-primary)]">{t('products.wizard.enableInsurance')}</span>
        </label>

        {data.insuranceEnabled && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>{t('products.wizard.insuranceProviderName')}</label>
              <input
                type="text"
                className={`w-full glass-input ${providerErr ? errorInputCls : ''}`}
                value={data.insuranceProvider}
                onChange={(e) => onChange({ insuranceProvider: e.target.value })}
                placeholder={t('products.wizard.providerPlaceholder')}
              />
              {providerErr && <FieldErrorMessage message={providerErr} />}
            </div>
            <div>
              <label className={labelCls}>{t('products.wizard.insurancePremiumRate')}</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={`w-full glass-input pr-8 ${premiumRateErr ? errorInputCls : ''}`}
                  value={data.insurancePremiumRate}
                  onChange={(e) => onChange({ insurancePremiumRate: e.target.value })}
                  placeholder={t('products.wizard.funding.placeholder.insuranceRate')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] text-sm">%</span>
              </div>
              {premiumRateErr && <FieldErrorMessage message={premiumRateErr} />}
            </div>
            <div>
              <label className={labelCls}>{t('products.wizard.coverageType')}</label>
              <select
                className={`w-full glass-input ${coverageTypeErr ? errorInputCls : ''}`}
                value={data.insuranceCoverageType}
                onChange={(e) => onChange({ insuranceCoverageType: e.target.value })}
              >
                {COVERAGE_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{t(ct.labelKey)}</option>
                ))}
              </select>
              {coverageTypeErr && <FieldErrorMessage message={coverageTypeErr} />}
            </div>
          </div>
        )}
      </div>

      {/* Revenue Sharing Preview */}
      <div className="card p-4 space-y-4">
        <h4 className="section-label">
          {t('products.wizard.revenueSharingPreview')}
        </h4>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.platformFee')}</label>
            <div className="w-full glass-input bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] cursor-not-allowed">
              {platformFeePercent}%
            </div>
            <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('products.wizard.setByTenant')}</p>
          </div>

          <div>
            <label className={labelCls}>{t('products.wizard.lenderShare')}</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className={`w-full glass-input pr-8 ${lenderShareErr ? errorInputCls : ''}`}
                value={data.revenueSharing.lenderSharePercent}
                onChange={(e) =>
                  onChange({
                    revenueSharing: { ...data.revenueSharing, lenderSharePercent: e.target.value },
                  })
                }
                placeholder={data.lenderId ? t('products.wizard.funding.placeholder.lenderShare') : '-'}
                disabled={!data.lenderId}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] text-sm">%</span>
            </div>
            {lenderShareErr && <FieldErrorMessage message={lenderShareErr} />}
          </div>

          <div>
            <label className={labelCls}>{t('products.wizard.spShare')}</label>
            <div className="w-full glass-input bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] cursor-not-allowed">
              {isNaN(spShare) ? '-' : `${spShare.toFixed(2)}`}%
            </div>
            <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('products.wizard.computedAutomatically')}</p>
          </div>
        </div>

        {spShare < 0 && (
          <div className="bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] rounded-lg p-3">
            <p className="text-sm text-[color:var(--status-error-text)]">{t('products.wizard.revenueShareExceeds100')}</p>
          </div>
        )}
      </div>

      {/* Add New Lender Modal */}
      {showAddLender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card-elevated rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto border border-[color:var(--border-subtle)]">
            <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)] mb-4">
              {t('products.wizard.addNewLender')}
            </h3>
            <LenderForm
              saving={creatingLender}
              onCancel={() => setShowAddLender(false)}
              onSave={async (formData) => {
                try {
                  const { data: result } = await createLender({ variables: { input: formData } });
                  if (result?.createLender) {
                    onChange({
                      lenderId: result.createLender.id,
                      lenderName: result.createLender.name,
                    } as Partial<StepFundingSourceProps['data']>);
                    setShowAddLender(false);
                    refetchLenders();
                  }
                } catch {
                  // Error handled by Apollo error link
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
