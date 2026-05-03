'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { FieldErrorMessage, StepErrorBanner, resolveError } from './field-error';
import { getFieldError, type FieldError } from './validation';

interface StepFinancialTermsProps {
  data: {
    minAmount: string;
    maxAmount: string;
    minTenorDays: string;
    maxTenorDays: string;
    interestRateModel: string;
    interestRate: string;
    repaymentMethod: string;
    gracePeriodDays: string;
    coolingOffHours: string;
  };
  currency: string;
  onChange: (updates: Partial<StepFinancialTermsProps['data']>) => void;
  errors?: FieldError[];
}

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

export function StepFinancialTerms({ data, currency, onChange, errors = [] }: StepFinancialTermsProps) {
  const { t } = useI18n();

  const INTEREST_MODELS = [
    { value: 'FLAT', label: t('products.interestModels.flatRate') },
    { value: 'REDUCING_BALANCE', label: t('products.interestModels.reducingBalance') },
  ];

  const REPAYMENT_METHODS = [
    { value: 'EQUAL_INSTALLMENT', label: t('products.repaymentMethods.equalInstallments') },
    { value: 'BULLET', label: t('products.repaymentMethods.bullet') },
    { value: 'INTEREST_ONLY', label: t('products.repaymentMethods.interestOnly') },
  ];

  const requiredStar = <span className="text-[color:var(--status-error-text)]">*</span>;
  const errorInputCls = 'ring-1 ring-red-500/50';
  const minAmtErr = resolveError(getFieldError(errors, 'minAmount'), t);
  const maxAmtErr = resolveError(getFieldError(errors, 'maxAmount'), t);
  const minTenorErr = resolveError(getFieldError(errors, 'minTenorDays'), t);
  const maxTenorErr = resolveError(getFieldError(errors, 'maxTenorDays'), t);
  const interestErr = resolveError(getFieldError(errors, 'interestRate'), t);
  const graceErr = resolveError(getFieldError(errors, 'gracePeriodDays'), t);
  const coolingOffErr = resolveError(getFieldError(errors, 'coolingOffHours'), t);

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.financialTermsTitle')}</h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">{t('products.wizard.financialTermsDesc')}</p>

      <StepErrorBanner message={t('validation.fixErrorsBeforeProceeding')} show={errors.length > 0} />

      <div className="card p-4 space-y-4">
        <h4 className="section-label">{t('products.wizard.loanAmount')} ({currency})</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.minimumAmount')} {requiredStar}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={`w-full glass-input ${minAmtErr ? errorInputCls : ''}`}
              value={data.minAmount}
              onChange={(e) => onChange({ minAmount: e.target.value })}
              placeholder={t('products.wizard.minAmountPlaceholder')}
              required
            />
            <FieldErrorMessage message={minAmtErr} />
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.maximumAmount')} {requiredStar}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={`w-full glass-input ${maxAmtErr ? errorInputCls : ''}`}
              value={data.maxAmount}
              onChange={(e) => onChange({ maxAmount: e.target.value })}
              placeholder={t('products.wizard.maxAmountPlaceholder')}
              required
            />
            <FieldErrorMessage message={maxAmtErr} />
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <h4 className="section-label">{t('products.wizard.tenor')}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.minimumTenor')} {requiredStar}</label>
            <input
              type="number"
              min="1"
              className={`w-full glass-input ${minTenorErr ? errorInputCls : ''}`}
              value={data.minTenorDays}
              onChange={(e) => onChange({ minTenorDays: e.target.value })}
              placeholder={t('products.wizard.minTenorPlaceholder')}
              required
            />
            <FieldErrorMessage message={minTenorErr} />
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.maximumTenor')} {requiredStar}</label>
            <input
              type="number"
              min="1"
              className={`w-full glass-input ${maxTenorErr ? errorInputCls : ''}`}
              value={data.maxTenorDays}
              onChange={(e) => onChange({ maxTenorDays: e.target.value })}
              placeholder={t('products.wizard.maxTenorPlaceholder')}
              required
            />
            <FieldErrorMessage message={maxTenorErr} />
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <h4 className="section-label">{t('products.wizard.interestAndRepayment')}</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.interestRateModel')} {requiredStar}</label>
            <select
              className="w-full glass-input"
              value={data.interestRateModel}
              onChange={(e) => onChange({ interestRateModel: e.target.value })}
            >
              {INTEREST_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('products.interestRatePercent')} {requiredStar}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className={`w-full glass-input ${interestErr ? errorInputCls : ''}`}
              value={data.interestRate}
              onChange={(e) => onChange({ interestRate: e.target.value })}
              placeholder={t('products.wizard.interestRatePlaceholder')}
              required
            />
            <FieldErrorMessage message={interestErr} />
          </div>
          <div>
            <label className={labelCls}>{t('products.repaymentMethod')} {requiredStar}</label>
            <select
              className="w-full glass-input"
              value={data.repaymentMethod}
              onChange={(e) => onChange({ repaymentMethod: e.target.value })}
            >
              {REPAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="max-w-xs">
          <label className={labelCls}>{t('products.gracePeriod')}</label>
          <input
            type="number"
            min="0"
            className={`w-full glass-input ${graceErr ? errorInputCls : ''}`}
            value={data.gracePeriodDays}
            onChange={(e) => onChange({ gracePeriodDays: e.target.value })}
            placeholder={t('products.wizard.gracePeriodPlaceholder')}
          />
          {graceErr ? <FieldErrorMessage message={graceErr} /> : <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('products.wizard.gracePeriodHelp')}</p>}
        </div>
        <div className="max-w-xs">
          <label className={labelCls}>{t('products.wizard.financial.coolingOffLabel')}</label>
          <input
            type="number"
            min="0"
            step="1"
            className={`w-full glass-input ${coolingOffErr ? errorInputCls : ''}`}
            value={data.coolingOffHours}
            onChange={(e) => onChange({ coolingOffHours: e.target.value })}
            placeholder={t('products.wizard.financial.placeholder.coolingOff')}
          />
          {coolingOffErr ? <FieldErrorMessage message={coolingOffErr} /> : <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('products.wizard.financial.coolingOffHelp')}</p>}
        </div>
      </div>
    </div>
  );
}
