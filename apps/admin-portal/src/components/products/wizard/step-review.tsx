'use client';

import type { ProductFormState } from './product-wizard';
import { useI18n } from '@/lib/i18n/i18n-context';
import { currencyLabel } from '@/lib/constants';

interface StepReviewProps {
  data: ProductFormState;
  activationErrors?: import('./validation').FieldError[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-3">
      <h4 className="section-label">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[color:var(--text-tertiary)]">{label}</dt>
      <dd className="text-sm text-[color:var(--text-primary)] mt-0.5">{value || '-'}</dd>
    </div>
  );
}

export function StepReview({ data, activationErrors = [] }: StepReviewProps) {
  const { t } = useI18n();

  const TYPE_LABELS: Record<string, string> = {
    OVERDRAFT: t('products.types.overdraft'),
    MICRO_LOAN: t('products.types.microLoan'),
    BNPL: t('products.types.bnpl'),
    INVOICE_FACTORING: t('products.types.invoiceFinancing'),
  };

  const MODEL_LABELS: Record<string, string> = {
    FLAT: t('products.interestModels.flatRate'),
    REDUCING_BALANCE: t('products.interestModels.reducingBalance'),
  };

  const METHOD_LABELS: Record<string, string> = {
    EQUAL_INSTALLMENT: t('products.repaymentMethods.equalInstallments'),
    BULLET: t('products.repaymentMethods.bullet'),
    INTEREST_ONLY: t('products.repaymentMethods.interestOnly'),
  };

  const WORKFLOW_LABELS: Record<string, string> = {
    AUTO: t('products.wizard.automatic'),
    MANUAL: t('products.wizard.manual'),
    HYBRID: t('products.wizard.hybrid'),
  };

  const notConfigured = t('products.wizard.notConfigured');

  function FeeDisplay({ label, fee }: { label: string; fee: { type: string; amount: string } }) {
    if (!fee.amount || fee.amount === '0') return <Field label={label} value={notConfigured} />;
    return (
      <Field
        label={label}
        value={fee.type === 'FLAT' ? `${t('products.wizard.flat')}: ${fee.amount}` : `${fee.amount}%`}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.reviewAndConfirm')}</h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">{t('products.wizard.reviewDesc')}</p>

      {activationErrors.length > 0 && (
        <div className="bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] rounded-lg p-4">
          <p className="text-sm text-[color:var(--status-error-text)] font-medium mb-2">{t('validation.activationErrors')}</p>
          <ul className="list-disc list-inside space-y-1">
            {activationErrors.map((err, idx) => (
              <li key={idx} className="text-xs text-[color:var(--status-error-text)]">
                {t(err.messageKey, err.params)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <Section title={t('products.wizard.basicInfo')}>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label={t('products.productCode')} value={data.code} />
            <Field label={t('products.name')} value={data.name} />
            <Field label={t('products.type')} value={TYPE_LABELS[data.type] || data.type} />
            <Field label={t('products.currency')} value={currencyLabel(data.currency)} />
            <div className="col-span-2">
              <Field label={t('products.description')} value={data.description} />
            </div>
          </dl>
        </Section>

        <Section title={t('products.wizard.financialTerms')}>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label={t('products.minAmount')} value={data.minAmount ? `${data.currency} ${data.minAmount}` : undefined} />
            <Field label={t('products.maxAmount')} value={data.maxAmount ? `${data.currency} ${data.maxAmount}` : undefined} />
            <Field label={t('products.interestRate')} value={data.interestRate ? `${data.interestRate}%` : undefined} />
            <Field label={t('products.interestModel')} value={MODEL_LABELS[data.interestRateModel] || data.interestRateModel} />
            <Field label={t('products.repaymentMethod')} value={METHOD_LABELS[data.repaymentMethod] || data.repaymentMethod} />
            <Field label={t('products.gracePeriod')} value={data.gracePeriodDays ? `${data.gracePeriodDays} ${t('common.days')}` : undefined} />
            <Field label={t('products.wizard.review.coolingOff')} value={data.coolingOffHours && data.coolingOffHours !== '0' ? `${data.coolingOffHours} ${t('common.hours')}` : t('common.disabled')} />
            <Field label={t('products.minTenor')} value={data.minTenorDays ? `${data.minTenorDays} ${t('common.days')}` : undefined} />
            <Field label={t('products.maxTenor')} value={data.maxTenorDays ? `${data.maxTenorDays} ${t('common.days')}` : undefined} />
          </dl>
        </Section>

        <Section title={t('products.wizard.feesAndCharges')}>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FeeDisplay label={t('products.wizard.originationFee')} fee={data.originationFee} />
            <FeeDisplay label={t('products.wizard.serviceFee')} fee={data.serviceFee} />
            <FeeDisplay label={t('products.wizard.latePenalty')} fee={data.latePenalty} />
            <FeeDisplay label={t('products.wizard.insurance')} fee={data.insurance} />
          </dl>
        </Section>

        <Section title={t('products.wizard.eligibilityTitle')}>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label={t('products.wizard.minCreditScore')} value={data.minCreditScore || undefined} />
            <Field label={t('products.wizard.minKycLevel')} value={data.minKycLevel ? `${t('products.wizard.level')} ${data.minKycLevel}` : undefined} />
            <Field label={t('products.maxActiveLoans')} value={data.maxActiveLoans || undefined} />
          </dl>
          {data.customRules && (
            <div className="mt-3">
              <dt className="text-xs font-medium text-[color:var(--text-tertiary)] mb-1">{t('products.wizard.customRules')}</dt>
              <pre className="text-xs text-[color:var(--text-secondary)] bg-[color:var(--bg-muted)] rounded-lg p-3 overflow-auto max-h-32">
                {data.customRules}
              </pre>
            </div>
          )}
        </Section>

        <Section title={t('products.wizard.fundingSourceTitle')}>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label={t('products.wizard.lenderSelection')} value={data.lenderName || (data.lenderId ? data.lenderId : notConfigured)} />
            <Field label={t('products.wizard.enableInsurance')} value={data.insuranceEnabled ? t('common.yes') : t('common.no')} />
            {data.insuranceEnabled && (
              <>
                <Field label={t('products.wizard.insuranceProviderName')} value={data.insuranceProvider || undefined} />
                <Field label={t('products.wizard.insurancePremiumRate')} value={data.insurancePremiumRate ? `${data.insurancePremiumRate}%` : undefined} />
                <Field label={t('products.wizard.coverageType')} value={data.insuranceCoverageType || undefined} />
              </>
            )}
            <Field label={t('products.wizard.lenderShare')} value={data.revenueSharing.lenderSharePercent ? `${data.revenueSharing.lenderSharePercent}%` : notConfigured} />
          </dl>
        </Section>

        <Section title={t('products.wizard.approvalWorkflowTitle')}>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label={t('products.wizard.workflowType')} value={WORKFLOW_LABELS[data.approvalWorkflow] || data.approvalWorkflow} />
            {(data.approvalWorkflow === 'AUTO' || data.approvalWorkflow === 'HYBRID') && (
              <Field label={t('products.wizard.autoApproveThresholdShort')} value={data.autoApproveThreshold || undefined} />
            )}
            <Field label={t('products.wizard.slaHours')} value={data.slaHours ? `${data.slaHours}h` : undefined} />
          </dl>
        </Section>

        {data.notifications.length > 0 && (
          <Section title={t('products.wizard.notificationsTitle')}>
            <div className="space-y-2">
              {data.notifications.map((n, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-[color:var(--bg-muted)] rounded-lg p-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border border-[color:var(--accent-primary-soft)]">
                    {n.channel}
                  </span>
                  <div className="flex-1">
                    <span className="text-xs font-medium text-[color:var(--text-secondary)]">{n.event}</span>
                    <p className="text-xs text-[color:var(--text-tertiary)] mt-0.5 line-clamp-2">{n.template || t('products.wizard.noTemplateSet')}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
