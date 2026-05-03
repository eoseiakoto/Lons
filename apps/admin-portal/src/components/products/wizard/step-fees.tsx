'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { FieldErrorMessage, StepErrorBanner, resolveError } from './field-error';
import { getFieldError, type FieldError } from './validation';

interface FeeConfig {
  type: 'FLAT' | 'PERCENTAGE';
  amount: string;
}

interface StepFeesProps {
  data: {
    originationFee: FeeConfig;
    serviceFee: FeeConfig;
    latePenalty: FeeConfig;
    insurance: FeeConfig;
  };
  currency: string;
  onChange: (updates: Partial<StepFeesProps['data']>) => void;
  errors?: FieldError[];
}

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

function FeeRow({
  label,
  description,
  fee,
  currency,
  flatLabel,
  percentageLabel,
  amountLabel,
  feeTypeLabel,
  flatPlaceholder,
  percentagePlaceholder,
  onTypeChange,
  onAmountChange,
  errorMessage,
  required,
}: {
  label: string;
  description: string;
  fee: FeeConfig;
  currency: string;
  flatLabel: string;
  percentageLabel: string;
  amountLabel: string;
  feeTypeLabel: string;
  flatPlaceholder: string;
  percentagePlaceholder: string;
  onTypeChange: (type: 'FLAT' | 'PERCENTAGE') => void;
  onAmountChange: (amount: string) => void;
  errorMessage?: string;
  required?: boolean;
}) {
  const errorInputCls = 'ring-1 ring-red-500/50';
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-[color:var(--text-primary)]">
            {label}
            {required && <span className="text-[color:var(--status-error-text)] ml-1">*</span>}
          </h4>
          <p className="text-xs text-[color:var(--text-tertiary)] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{feeTypeLabel}</label>
          <select
            className="w-full glass-input"
            value={fee.type}
            onChange={(e) => onTypeChange(e.target.value as 'FLAT' | 'PERCENTAGE')}
          >
            <option value="FLAT">{flatLabel} ({currency})</option>
            <option value="PERCENTAGE">{percentageLabel} (%)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>
            {fee.type === 'FLAT' ? `${amountLabel} (${currency})` : `${percentageLabel} (%)`}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={`w-full glass-input ${errorMessage ? errorInputCls : ''}`}
            value={fee.amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder={fee.type === 'FLAT' ? flatPlaceholder : percentagePlaceholder}
          />
          <FieldErrorMessage message={errorMessage} />
        </div>
      </div>
    </div>
  );
}

export function StepFees({ data, currency, onChange, errors = [] }: StepFeesProps) {
  const { t } = useI18n();

  const updateFee = (
    key: keyof StepFeesProps['data'],
    field: 'type' | 'amount',
    value: string,
  ) => {
    onChange({
      [key]: {
        ...data[key],
        [field]: value,
      },
    });
  };

  const feeTypeLabel = t('products.wizard.feeType');
  const flatLabel = t('products.wizard.flatAmount');
  const percentageLabel = t('products.wizard.percentage');
  const amountLabel = t('products.wizard.amount');
  const flatPlaceholder = t('products.wizard.fees.placeholder.flatAmount');
  const percentagePlaceholder = t('products.wizard.fees.placeholder.percentage');

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.feesAndCharges')}</h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">{t('products.wizard.feesDesc')}</p>

      <StepErrorBanner message={t('validation.fixErrorsBeforeProceeding')} show={errors.length > 0} />

      <div className="space-y-4">
        <FeeRow
          label={t('products.wizard.originationFee')}
          description={t('products.wizard.originationFeeDesc')}
          fee={data.originationFee}
          currency={currency}
          feeTypeLabel={feeTypeLabel}
          flatLabel={flatLabel}
          percentageLabel={percentageLabel}
          amountLabel={amountLabel}
          flatPlaceholder={flatPlaceholder}
          percentagePlaceholder={percentagePlaceholder}
          onTypeChange={(type) => updateFee('originationFee', 'type', type)}
          onAmountChange={(amount) => updateFee('originationFee', 'amount', amount)}
          errorMessage={resolveError(getFieldError(errors, 'originationFee.amount'), t)}
          required
        />

        <FeeRow
          label={t('products.wizard.serviceFee')}
          description={t('products.wizard.serviceFeeDesc')}
          fee={data.serviceFee}
          currency={currency}
          feeTypeLabel={feeTypeLabel}
          flatLabel={flatLabel}
          percentageLabel={percentageLabel}
          amountLabel={amountLabel}
          flatPlaceholder={flatPlaceholder}
          percentagePlaceholder={percentagePlaceholder}
          onTypeChange={(type) => updateFee('serviceFee', 'type', type)}
          onAmountChange={(amount) => updateFee('serviceFee', 'amount', amount)}
          errorMessage={resolveError(getFieldError(errors, 'serviceFee.amount'), t)}
        />

        <FeeRow
          label={t('products.wizard.latePenaltyLabel')}
          description={t('products.wizard.latePenaltyDesc')}
          fee={data.latePenalty}
          currency={currency}
          feeTypeLabel={feeTypeLabel}
          flatLabel={flatLabel}
          percentageLabel={percentageLabel}
          amountLabel={amountLabel}
          flatPlaceholder={flatPlaceholder}
          percentagePlaceholder={percentagePlaceholder}
          onTypeChange={(type) => updateFee('latePenalty', 'type', type)}
          onAmountChange={(amount) => updateFee('latePenalty', 'amount', amount)}
          errorMessage={resolveError(getFieldError(errors, 'latePenalty.amount'), t)}
          required
        />

        <FeeRow
          label={t('products.wizard.insuranceLabel')}
          description={t('products.wizard.insuranceDesc')}
          fee={data.insurance}
          currency={currency}
          feeTypeLabel={feeTypeLabel}
          flatLabel={flatLabel}
          percentageLabel={percentageLabel}
          amountLabel={amountLabel}
          flatPlaceholder={flatPlaceholder}
          percentagePlaceholder={percentagePlaceholder}
          onTypeChange={(type) => updateFee('insurance', 'type', type)}
          onAmountChange={(amount) => updateFee('insurance', 'amount', amount)}
          errorMessage={resolveError(getFieldError(errors, 'insurance.amount'), t)}
        />
      </div>
    </div>
  );
}
