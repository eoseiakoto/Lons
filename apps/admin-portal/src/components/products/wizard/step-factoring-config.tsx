'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { FieldErrorMessage, StepErrorBanner, resolveError } from './field-error';
import { getFieldError, type FieldError } from './validation';

export interface FactoringConfigData {
  advanceRateMin: string;
  advanceRateMax: string;
  advanceRateDefault: string;
  discountRateAnnual: string;
  serviceFeeFlat: string;
  defaultRecourseType: 'with_recourse' | 'without_recourse';
  nonRecourseEligibility: {
    minDebtorRiskScore: string;
    minDebtorPaymentHistory: string;
    maxInvoiceTenorDays: string;
    feeMultiplier: string;
  };
  verificationRules: {
    autoVerifyBelow: string;
    manualVerifyAbove: string;
    manualVerifyNewSeller: boolean;
    manualVerifyNewDebtor: boolean;
  };
  concentrationLimits: {
    maxDebtorExposurePercent: string;
    maxDebtorExposureAmount: string;
    maxIndustryExposurePercent: string;
    maxSellerDebtorPercent: string;
  };
  agingThresholds: {
    graceEndDpd: string;
    overdueEndDpd: string;
    seriouslyOverdueEndDpd: string;
    defaultDpd: string;
  };
  reserveRelease: {
    auto: boolean;
    manualReleaseAbove: string;
  };
}

interface StepFactoringConfigProps {
  data: FactoringConfigData;
  currency: string;
  onChange: (updates: Partial<FactoringConfigData>) => void;
  errors?: FieldError[];
}

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

export function StepFactoringConfig({
  data,
  currency,
  onChange,
  errors = [],
}: StepFactoringConfigProps) {
  const { t } = useI18n();
  const errorInputCls = 'ring-1 ring-red-500/50';

  const errFor = (path: string) => resolveError(getFieldError(errors, path), t);

  const updateNested = <K extends keyof FactoringConfigData>(
    key: K,
    field: string,
    value: string | boolean,
  ) => {
    const current = data[key] as Record<string, unknown>;
    onChange({ [key]: { ...current, [field]: value } } as unknown as Partial<FactoringConfigData>);
  };

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">
        {t('products.wizard.factoring.title')}
      </h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">
        {t('products.wizard.factoring.description')}
      </p>

      <StepErrorBanner
        message={t('validation.fixErrorsBeforeProceeding')}
        show={errors.length > 0}
      />

      {/* Advance rate range */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.advanceRateRange')}</h4>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          {t('products.wizard.factoring.advanceRateRangeHelp')}
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.advanceRateMin')}</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.advanceRateMin') ? errorInputCls : ''}`}
              value={data.advanceRateMin}
              onChange={(e) => onChange({ advanceRateMin: e.target.value })}
              placeholder={t('products.wizard.factoring.placeholder.advanceRateMin')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.advanceRateMin')} />
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.advanceRateMax')}</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.advanceRateMax') ? errorInputCls : ''}`}
              value={data.advanceRateMax}
              onChange={(e) => onChange({ advanceRateMax: e.target.value })}
              placeholder={t('products.wizard.factoring.placeholder.advanceRateMax')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.advanceRateMax')} />
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.advanceRateDefault')}</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.advanceRateDefault') ? errorInputCls : ''}`}
              value={data.advanceRateDefault}
              onChange={(e) => onChange({ advanceRateDefault: e.target.value })}
              placeholder={t('products.wizard.factoring.placeholder.advanceRateDefault')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.advanceRateDefault')} />
          </div>
        </div>
      </div>

      {/* Discount rate + service fee */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.feesAndDiscount')}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.discountRateAnnual')}</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.discountRateAnnual') ? errorInputCls : ''}`}
              value={data.discountRateAnnual}
              onChange={(e) => onChange({ discountRateAnnual: e.target.value })}
              placeholder={t('products.wizard.factoring.placeholder.discountRate')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.discountRateAnnual')} />
            <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
              {t('products.wizard.factoring.discountRateHelp')}
            </p>
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.serviceFeeFlat')} ({currency})
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.serviceFeeFlat') ? errorInputCls : ''}`}
              value={data.serviceFeeFlat}
              onChange={(e) => onChange({ serviceFeeFlat: e.target.value })}
              placeholder={t('products.wizard.factoring.placeholder.serviceFeeFlat')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.serviceFeeFlat')} />
          </div>
        </div>
      </div>

      {/* Default recourse type */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.defaultRecourseType')}</h4>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          {t('products.wizard.factoring.defaultRecourseTypeHelp')}
        </p>
        <select
          className="w-full glass-input"
          value={data.defaultRecourseType}
          onChange={(e) =>
            onChange({
              defaultRecourseType: e.target.value as 'with_recourse' | 'without_recourse',
            })
          }
        >
          <option value="with_recourse">{t('products.wizard.factoring.recourse.withRecourse')}</option>
          <option value="without_recourse">{t('products.wizard.factoring.recourse.withoutRecourse')}</option>
        </select>
      </div>

      {/* Non-recourse eligibility */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.nonRecourseEligibility')}</h4>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          {t('products.wizard.factoring.nonRecourseEligibilityHelp')}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.minDebtorRiskScore')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              className={`w-full glass-input ${errFor('factoringConfig.nonRecourseEligibility.minDebtorRiskScore') ? errorInputCls : ''}`}
              value={data.nonRecourseEligibility.minDebtorRiskScore}
              onChange={(e) =>
                updateNested('nonRecourseEligibility', 'minDebtorRiskScore', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.minDebtorRiskScore')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.nonRecourseEligibility.minDebtorRiskScore')}
            />
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.minDebtorPaymentHistory')}
            </label>
            <input
              type="number"
              min="0"
              className={`w-full glass-input ${errFor('factoringConfig.nonRecourseEligibility.minDebtorPaymentHistory') ? errorInputCls : ''}`}
              value={data.nonRecourseEligibility.minDebtorPaymentHistory}
              onChange={(e) =>
                updateNested('nonRecourseEligibility', 'minDebtorPaymentHistory', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.minDebtorPaymentHistory')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.nonRecourseEligibility.minDebtorPaymentHistory')}
            />
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.maxInvoiceTenorDays')}
            </label>
            <input
              type="number"
              min="1"
              className={`w-full glass-input ${errFor('factoringConfig.nonRecourseEligibility.maxInvoiceTenorDays') ? errorInputCls : ''}`}
              value={data.nonRecourseEligibility.maxInvoiceTenorDays}
              onChange={(e) =>
                updateNested('nonRecourseEligibility', 'maxInvoiceTenorDays', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.maxInvoiceTenorDays')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.nonRecourseEligibility.maxInvoiceTenorDays')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.feeMultiplier')}</label>
            <input
              type="number"
              min="1"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.nonRecourseEligibility.feeMultiplier') ? errorInputCls : ''}`}
              value={data.nonRecourseEligibility.feeMultiplier}
              onChange={(e) =>
                updateNested('nonRecourseEligibility', 'feeMultiplier', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.feeMultiplier')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.nonRecourseEligibility.feeMultiplier')}
            />
          </div>
        </div>
      </div>

      {/* Verification rules */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.verificationRules')}</h4>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          {t('products.wizard.factoring.verificationRulesHelp')}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.autoVerifyBelow')} ({currency})
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.verificationRules.autoVerifyBelow') ? errorInputCls : ''}`}
              value={data.verificationRules.autoVerifyBelow}
              onChange={(e) =>
                updateNested('verificationRules', 'autoVerifyBelow', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.autoVerifyBelow')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.verificationRules.autoVerifyBelow')}
            />
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.manualVerifyAbove')} ({currency})
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.verificationRules.manualVerifyAbove') ? errorInputCls : ''}`}
              value={data.verificationRules.manualVerifyAbove}
              onChange={(e) =>
                updateNested('verificationRules', 'manualVerifyAbove', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.manualVerifyAbove')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.verificationRules.manualVerifyAbove')}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
          <input
            type="checkbox"
            checked={data.verificationRules.manualVerifyNewSeller}
            onChange={(e) =>
              updateNested('verificationRules', 'manualVerifyNewSeller', e.target.checked)
            }
          />
          {t('products.wizard.factoring.manualVerifyNewSeller')}
        </label>
        <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
          <input
            type="checkbox"
            checked={data.verificationRules.manualVerifyNewDebtor}
            onChange={(e) =>
              updateNested('verificationRules', 'manualVerifyNewDebtor', e.target.checked)
            }
          />
          {t('products.wizard.factoring.manualVerifyNewDebtor')}
        </label>
      </div>

      {/* Concentration limits */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.concentrationLimits')}</h4>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          {t('products.wizard.factoring.concentrationLimitsHelp')}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.maxDebtorExposurePercent')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.concentrationLimits.maxDebtorExposurePercent') ? errorInputCls : ''}`}
              value={data.concentrationLimits.maxDebtorExposurePercent}
              onChange={(e) =>
                updateNested('concentrationLimits', 'maxDebtorExposurePercent', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.exposurePercent')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.concentrationLimits.maxDebtorExposurePercent')}
            />
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.maxDebtorExposureAmount')} ({currency})
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.concentrationLimits.maxDebtorExposureAmount') ? errorInputCls : ''}`}
              value={data.concentrationLimits.maxDebtorExposureAmount}
              onChange={(e) =>
                updateNested('concentrationLimits', 'maxDebtorExposureAmount', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.exposureAmount')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.concentrationLimits.maxDebtorExposureAmount')}
            />
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.maxIndustryExposurePercent')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.concentrationLimits.maxIndustryExposurePercent') ? errorInputCls : ''}`}
              value={data.concentrationLimits.maxIndustryExposurePercent}
              onChange={(e) =>
                updateNested('concentrationLimits', 'maxIndustryExposurePercent', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.exposurePercent')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.concentrationLimits.maxIndustryExposurePercent')}
            />
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.maxSellerDebtorPercent')}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={`w-full glass-input ${errFor('factoringConfig.concentrationLimits.maxSellerDebtorPercent') ? errorInputCls : ''}`}
              value={data.concentrationLimits.maxSellerDebtorPercent}
              onChange={(e) =>
                updateNested('concentrationLimits', 'maxSellerDebtorPercent', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.exposurePercent')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.concentrationLimits.maxSellerDebtorPercent')}
            />
          </div>
        </div>
      </div>

      {/* Aging thresholds */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.agingThresholds')}</h4>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          {t('products.wizard.factoring.agingThresholdsHelp')}
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.graceEndDpd')}</label>
            <input
              type="number"
              min="0"
              className={`w-full glass-input ${errFor('factoringConfig.agingThresholds.graceEndDpd') ? errorInputCls : ''}`}
              value={data.agingThresholds.graceEndDpd}
              onChange={(e) => updateNested('agingThresholds', 'graceEndDpd', e.target.value)}
              placeholder={t('products.wizard.factoring.placeholder.graceEndDpd')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.agingThresholds.graceEndDpd')} />
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.overdueEndDpd')}</label>
            <input
              type="number"
              min="0"
              className={`w-full glass-input ${errFor('factoringConfig.agingThresholds.overdueEndDpd') ? errorInputCls : ''}`}
              value={data.agingThresholds.overdueEndDpd}
              onChange={(e) => updateNested('agingThresholds', 'overdueEndDpd', e.target.value)}
              placeholder={t('products.wizard.factoring.placeholder.overdueEndDpd')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.agingThresholds.overdueEndDpd')} />
          </div>
          <div>
            <label className={labelCls}>
              {t('products.wizard.factoring.seriouslyOverdueEndDpd')}
            </label>
            <input
              type="number"
              min="0"
              className={`w-full glass-input ${errFor('factoringConfig.agingThresholds.seriouslyOverdueEndDpd') ? errorInputCls : ''}`}
              value={data.agingThresholds.seriouslyOverdueEndDpd}
              onChange={(e) =>
                updateNested('agingThresholds', 'seriouslyOverdueEndDpd', e.target.value)
              }
              placeholder={t('products.wizard.factoring.placeholder.seriouslyOverdueEndDpd')}
            />
            <FieldErrorMessage
              message={errFor('factoringConfig.agingThresholds.seriouslyOverdueEndDpd')}
            />
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.factoring.defaultDpd')}</label>
            <input
              type="number"
              min="0"
              className={`w-full glass-input ${errFor('factoringConfig.agingThresholds.defaultDpd') ? errorInputCls : ''}`}
              value={data.agingThresholds.defaultDpd}
              onChange={(e) => updateNested('agingThresholds', 'defaultDpd', e.target.value)}
              placeholder={t('products.wizard.factoring.placeholder.defaultDpd')}
            />
            <FieldErrorMessage message={errFor('factoringConfig.agingThresholds.defaultDpd')} />
          </div>
        </div>
      </div>

      {/* Reserve release */}
      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.factoring.reserveRelease')}</h4>
        <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
          <input
            type="checkbox"
            checked={data.reserveRelease.auto}
            onChange={(e) => updateNested('reserveRelease', 'auto', e.target.checked)}
          />
          {t('products.wizard.factoring.reserveReleaseAuto')}
        </label>
        <div>
          <label className={labelCls}>
            {t('products.wizard.factoring.reserveManualReleaseAbove')} ({currency})
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={`w-full glass-input ${errFor('factoringConfig.reserveRelease.manualReleaseAbove') ? errorInputCls : ''}`}
            value={data.reserveRelease.manualReleaseAbove}
            onChange={(e) =>
              updateNested('reserveRelease', 'manualReleaseAbove', e.target.value)
            }
            placeholder={t('products.wizard.factoring.placeholder.manualReleaseAbove')}
          />
          <FieldErrorMessage
            message={errFor('factoringConfig.reserveRelease.manualReleaseAbove')}
          />
          <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
            {t('products.wizard.factoring.reserveManualReleaseAboveHelp')}
          </p>
        </div>
      </div>
    </div>
  );
}
