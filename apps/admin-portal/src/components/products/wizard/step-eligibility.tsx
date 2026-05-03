'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { FieldErrorMessage, StepErrorBanner, resolveError } from './field-error';
import { getFieldError, type FieldError } from './validation';

interface StepEligibilityProps {
  data: {
    minCreditScore: string;
    minKycLevel: string;
    maxActiveLoans: string;
    customRules: string;
  };
  onChange: (updates: Partial<StepEligibilityProps['data']>) => void;
  errors?: FieldError[];
}

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

export function StepEligibility({ data, onChange, errors = [] }: StepEligibilityProps) {
  const { t } = useI18n();
  const [jsonError, setJsonError] = useState<string | null>(null);

  const KYC_LEVELS = [
    { value: '0', label: t('products.wizard.kycLevel0') },
    { value: '1', label: t('products.wizard.kycLevel1') },
    { value: '2', label: t('products.wizard.kycLevel2') },
    { value: '3', label: t('products.wizard.kycLevel3') },
  ];

  const handleCustomRulesChange = (value: string) => {
    onChange({ customRules: value });
    if (value.trim() === '') {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError(t('products.wizard.invalidJson'));
    }
  };

  const requiredStar = <span className="text-[color:var(--status-error-text)]">*</span>;
  const errorInputCls = 'ring-1 ring-red-500/50';
  const scoreErr = resolveError(getFieldError(errors, 'minCreditScore'), t);
  const loansErr = resolveError(getFieldError(errors, 'maxActiveLoans'), t);
  const rulesErr = resolveError(getFieldError(errors, 'customRules'), t);

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.eligibilityTitle')}</h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">{t('products.wizard.eligibilityDesc')}</p>

      <StepErrorBanner message={t('validation.fixErrorsBeforeProceeding')} show={errors.length > 0} />

      <div className="card p-4 space-y-4">
        <h4 className="section-label">{t('products.wizard.scoringAndKyc')}</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>{t('products.wizard.minCreditScore')}</label>
            <input
              type="number"
              min="0"
              max="1000"
              className={`w-full glass-input ${scoreErr ? errorInputCls : ''}`}
              value={data.minCreditScore}
              onChange={(e) => onChange({ minCreditScore: e.target.value })}
              placeholder={t('products.wizard.eligibility.placeholder.minScore')}
            />
            {scoreErr ? <FieldErrorMessage message={scoreErr} /> : <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('products.wizard.scoreRange')}</p>}
          </div>
          <div>
            <label className={labelCls}>{t('products.wizard.minKycLevel')}</label>
            <select
              className="w-full glass-input"
              value={data.minKycLevel}
              onChange={(e) => onChange({ minKycLevel: e.target.value })}
            >
              {KYC_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('products.maxActiveLoans')} {requiredStar}</label>
            <input
              type="number"
              min="1"
              max="50"
              className={`w-full glass-input ${loansErr ? errorInputCls : ''}`}
              value={data.maxActiveLoans}
              onChange={(e) => onChange({ maxActiveLoans: e.target.value })}
              placeholder={t('products.wizard.eligibility.placeholder.minHistory')}
            />
            {loansErr ? <FieldErrorMessage message={loansErr} /> : <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('products.wizard.maxConcurrentLoans')}</p>}
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h4 className="section-label">{t('products.wizard.customRules')}</h4>
        <p className="text-xs text-[color:var(--text-tertiary)]">
          {t('products.wizard.customRulesDesc')}
        </p>
        <textarea
          className={`w-full glass-input font-mono text-sm ${rulesErr || jsonError ? errorInputCls : ''}`}
          value={data.customRules}
          onChange={(e) => handleCustomRulesChange(e.target.value)}
          rows={6}
          placeholder={`[\n  { "field": "monthly_income", "operator": ">=", "value": 500 },\n  { "field": "account_age_days", "operator": ">=", "value": 90 }\n]`}
        />
        {rulesErr && <FieldErrorMessage message={rulesErr} />}
        {!rulesErr && jsonError && <p className="text-xs text-[color:var(--status-error-text)]">{jsonError}</p>}
      </div>
    </div>
  );
}
