'use client';

import { ALL_CURRENCIES, currencyLabel } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/i18n-context';
import { FieldErrorMessage, StepErrorBanner, resolveError } from './field-error';
import { getFieldError, type FieldError } from './validation';

interface StepBasicInfoProps {
  data: {
    code: string;
    name: string;
    description: string;
    type: string;
    currency: string;
  };
  onChange: (updates: Partial<StepBasicInfoProps['data']>) => void;
  mode?: 'create' | 'edit';
  errors?: FieldError[];
}

const PRODUCT_TYPES = [
  { value: 'OVERDRAFT', labelKey: 'products.types.overdraft' },
  { value: 'MICRO_LOAN', labelKey: 'products.types.microLoan' },
  { value: 'BNPL', labelKey: 'products.types.bnpl' },
  { value: 'INVOICE_FACTORING', labelKey: 'products.types.invoiceFinancing' },
];

export function StepBasicInfo({ data, onChange, mode = 'create', errors = [] }: StepBasicInfoProps) {
  const { t } = useI18n();
  const isEdit = mode === 'edit';
  const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';
  const readOnlyCls = 'w-full glass-input bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] cursor-not-allowed';
  const hintCls = 'text-xs text-[color:var(--text-tertiary)] mt-1';
  const errorInputCls = 'ring-1 ring-red-500/50';

  const nameErr = resolveError(getFieldError(errors, 'name'), t);
  const descErr = resolveError(getFieldError(errors, 'description'), t);

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.basicInformation')}</h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">{t('products.wizard.setProductIdentity')}</p>

      <StepErrorBanner message={t('validation.fixErrorsBeforeProceeding')} show={errors.length > 0} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('products.productCode')}</label>
          <div className={readOnlyCls}>{data.code || '...'}</div>
          <p className={hintCls}>
            {isEdit ? t('products.wizard.immutableField') : t('products.wizard.productCodeHelp')}
          </p>
        </div>
        <div>
          <label className={labelCls}>
            {t('products.productName')} <span className="text-[color:var(--status-error-text)]">*</span>
          </label>
          <input
            className={`w-full glass-input ${nameErr ? errorInputCls : ''}`}
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t('products.wizard.productNamePlaceholder')}
            required
          />
          <FieldErrorMessage message={nameErr} />
        </div>
      </div>

      <div>
        <label className={labelCls}>{t('products.description')}</label>
        <textarea
          className={`w-full glass-input ${descErr ? errorInputCls : ''}`}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder={t('products.wizard.describeProduct')}
        />
        <FieldErrorMessage message={descErr} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>
            {t('products.wizard.productType')} <span className="text-[color:var(--status-error-text)]">*</span>
          </label>
          {isEdit ? (
            <>
              <div className={readOnlyCls}>
                {t(PRODUCT_TYPES.find((pt) => pt.value === data.type)?.labelKey || 'products.types.microLoan')}
              </div>
              <p className={hintCls}>{t('products.wizard.immutableField')}</p>
            </>
          ) : (
            <select
              className="w-full glass-input"
              value={data.type}
              onChange={(e) => onChange({ type: e.target.value })}
            >
              {PRODUCT_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>{t(pt.labelKey)}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className={labelCls}>
            {t('products.currency')} <span className="text-[color:var(--status-error-text)]">*</span>
          </label>
          {isEdit ? (
            <>
              <div className={readOnlyCls}>{currencyLabel(data.currency)}</div>
              <p className={hintCls}>{t('products.wizard.immutableField')}</p>
            </>
          ) : (
            <select
              className="w-full glass-input"
              value={data.currency}
              onChange={(e) => onChange({ currency: e.target.value })}
            >
              {ALL_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{currencyLabel(c.code)}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
