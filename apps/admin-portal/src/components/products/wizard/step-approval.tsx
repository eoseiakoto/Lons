'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { FieldErrorMessage, StepErrorBanner, resolveError } from './field-error';
import { getFieldError, type FieldError } from './validation';

interface StepApprovalProps {
  data: {
    approvalWorkflow: string;
    autoApproveThreshold: string;
    slaHours: string;
  };
  onChange: (updates: Partial<StepApprovalProps['data']>) => void;
  errors?: FieldError[];
}

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

export function StepApproval({ data, onChange, errors = [] }: StepApprovalProps) {
  const { t } = useI18n();
  const showThreshold = data.approvalWorkflow === 'AUTO' || data.approvalWorkflow === 'HYBRID';
  const requiredStar = <span className="text-[color:var(--status-error-text)]">*</span>;
  const errorInputCls = 'ring-1 ring-red-500/50';
  const thresholdErr = resolveError(getFieldError(errors, 'autoApproveThreshold'), t);
  const slaErr = resolveError(getFieldError(errors, 'slaHours'), t);

  const WORKFLOW_TYPES = [
    { value: 'AUTO', label: t('products.wizard.automatic'), description: t('products.wizard.automaticDesc') },
    { value: 'MANUAL', label: t('products.wizard.manual'), description: t('products.wizard.manualDesc') },
    { value: 'HYBRID', label: t('products.wizard.hybrid'), description: t('products.wizard.hybridDesc') },
  ];

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">{t('products.wizard.approvalWorkflowTitle')}</h3>
      <p className="text-sm text-[color:var(--text-tertiary)]">{t('products.wizard.approvalWorkflowDesc')}</p>

      <StepErrorBanner message={t('validation.fixErrorsBeforeProceeding')} show={errors.length > 0} />

      <div className="space-y-3">
        {WORKFLOW_TYPES.map((wf) => (
          <label
            key={wf.value}
            className={`card p-4 flex items-start gap-4 cursor-pointer transition-all duration-200 ${
              data.approvalWorkflow === wf.value
                ? 'border-[color:var(--accent-primary)] bg-[color:var(--accent-primary-soft)]'
                : 'hover:bg-[color:var(--bg-muted)]'
            }`}
          >
            <input
              type="radio"
              name="approvalWorkflow"
              value={wf.value}
              checked={data.approvalWorkflow === wf.value}
              onChange={(e) => onChange({ approvalWorkflow: e.target.value })}
              className="mt-1 accent-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-[color:var(--text-primary)]">{wf.label}</span>
              <p className="text-xs text-[color:var(--text-tertiary)] mt-0.5">{wf.description}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="card p-4 space-y-4">
        <h4 className="section-label">{t('products.wizard.parameters')}</h4>
        <div className="grid grid-cols-2 gap-4">
          {showThreshold && (
            <div>
              <label className={labelCls}>{t('products.wizard.autoApproveThreshold')} {requiredStar}</label>
              <input
                type="number"
                min="0"
                max="1000"
                className={`w-full glass-input ${thresholdErr ? errorInputCls : ''}`}
                value={data.autoApproveThreshold}
                onChange={(e) => onChange({ autoApproveThreshold: e.target.value })}
                placeholder={t('products.wizard.thresholdPlaceholder')}
              />
              {thresholdErr
                ? <FieldErrorMessage message={thresholdErr} />
                : <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
                    {data.approvalWorkflow === 'AUTO'
                      ? t('products.wizard.scoreForAutoApproval')
                      : t('products.wizard.scoresAboveAutoApproved')}
                  </p>
              }
            </div>
          )}
          <div>
            <label className={labelCls}>{t('products.wizard.slaHours')} {requiredStar}</label>
            <input
              type="number"
              min="1"
              max="720"
              className={`w-full glass-input ${slaErr ? errorInputCls : ''}`}
              value={data.slaHours}
              onChange={(e) => onChange({ slaHours: e.target.value })}
              placeholder={t('products.wizard.slaPlaceholder')}
            />
            {slaErr
              ? <FieldErrorMessage message={slaErr} />
              : <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('products.wizard.maxHoursToProcess')}</p>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
