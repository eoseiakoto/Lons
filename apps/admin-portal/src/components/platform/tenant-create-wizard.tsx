'use client';

import { useState } from 'react';
import { ALL_COUNTRIES, countryLabel, COUNTRY_MAP } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';

interface WizardStep {
  titleKey: string;
  descriptionKey: string;
}

const STEPS: WizardStep[] = [
  { titleKey: 'platform.wizard.step1Title', descriptionKey: 'platform.wizard.step1Desc' },
  { titleKey: 'platform.wizard.step2Title', descriptionKey: 'platform.wizard.step2Desc' },
  { titleKey: 'platform.wizard.step3Title', descriptionKey: 'platform.wizard.step3Desc' },
  { titleKey: 'platform.wizard.step4Title', descriptionKey: 'platform.wizard.step4Desc' },
];

export interface TenantCreateForm {
  // Step 1: Basic Info
  name: string;
  slug: string;
  legalName: string;
  registrationNumber: string;
  country: string;
  // Step 2: Admin User
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  // Step 3: Configuration
  planTier: string;
  settings: string;
}

const DEFAULT_FORM: TenantCreateForm = {
  name: '',
  slug: '',
  legalName: '',
  registrationNumber: '',
  country: 'GH',
  adminEmail: '',
  adminName: '',
  adminPassword: '',
  planTier: 'starter',
  settings: '{}',
};

interface TenantCreateWizardProps {
  onSubmit: (data: TenantCreateForm) => void;
  submitting?: boolean;
}

export function TenantCreateWizard({ onSubmit, submitting }: TenantCreateWizardProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<TenantCreateForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: keyof TenantCreateForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const autoSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);
  };

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!form.name.trim()) errs.name = t('platform.wizard.validation.nameRequired');
      if (!form.slug.trim()) errs.slug = t('platform.wizard.validation.slugRequired');
      if (!form.country.trim()) errs.country = t('platform.wizard.validation.countryRequired');
    } else if (s === 1) {
      if (!form.adminEmail.trim()) errs.adminEmail = t('platform.wizard.validation.emailRequired');
      if (!form.adminName.trim()) errs.adminName = t('platform.wizard.validation.nameRequired');
      if (form.adminPassword.length < 12) errs.adminPassword = t('platform.wizard.validation.passwordMin');
      else if (!/[A-Z]/.test(form.adminPassword)) errs.adminPassword = t('platform.wizard.validation.passwordUppercase');
      else if (!/[a-z]/.test(form.adminPassword)) errs.adminPassword = t('platform.wizard.validation.passwordLowercase');
      else if (!/[0-9]/.test(form.adminPassword)) errs.adminPassword = t('platform.wizard.validation.passwordDigit');
      else if (!/[^A-Za-z0-9]/.test(form.adminPassword)) errs.adminPassword = t('platform.wizard.validation.passwordSpecial');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = () => {
    if (validateStep(0) && validateStep(1)) {
      onSubmit(form);
    }
  };

  const labelCls = 'block text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5';
  const errCls = 'text-[11px] text-[color:var(--status-error-text)] mt-1.5';

  return (
    <div>
      {/* Progress indicators */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const isActive = i === step;
          const isComplete = i < step;
          return (
            <div key={i} className="flex items-center">
              <button
                onClick={() => isComplete && setStep(i)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-semibold transition-all"
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--text-on-accent)',
                        boxShadow: '0 0 16px -2px rgba(var(--accent-primary-rgb), 0.45)',
                      }
                    : isComplete
                      ? {
                          backgroundColor: 'var(--accent-primary-soft)',
                          color: 'var(--accent-primary-deep)',
                          border: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                        }
                      : {
                          backgroundColor: 'var(--bg-muted)',
                          color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-subtle)',
                        }
                }
              >
                {i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className="w-12 h-px mx-1"
                  style={{
                    backgroundColor: isComplete ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="card-glow card-glow-sweep p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--accent-primary-deep)] mb-1">
          0{step + 1} · {t('platform.wizard.stepLabel')}
        </p>
        <h3 className="text-[20px] font-semibold tracking-tight text-[color:var(--text-primary)]">
          {t(STEPS[step].titleKey)}
        </h3>
        <p className="text-[13px] text-[color:var(--text-tertiary)] mb-6 mt-1">
          {t(STEPS[step].descriptionKey)}
        </p>

        {/* Step 1: Basic Info */}
        {step === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>{t('platform.wizard.orgName')}</label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => {
                  set('name', e.target.value);
                  if (!form.slug || form.slug === autoSlug(form.name)) {
                    set('slug', autoSlug(e.target.value));
                  }
                }}
                placeholder={t('platform.wizard.placeholder.orgName')}
              />
              {errors.name && <p className={errCls}>{errors.name}</p>}
            </div>
            <div>
              <label className={labelCls}>{t('platform.wizard.slug')}</label>
              <input
                className="input-field"
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder={t('platform.wizard.placeholder.slug')}
              />
              {errors.slug && <p className={errCls}>{errors.slug}</p>}
            </div>
            <div>
              <label className={labelCls}>{t('platform.wizard.legalName')}</label>
              <input
                className="input-field"
                value={form.legalName}
                onChange={(e) => set('legalName', e.target.value)}
                placeholder={t('platform.wizard.placeholder.legalName')}
              />
            </div>
            <div>
              <label className={labelCls}>{t('platform.wizard.registrationNumber')}</label>
              <input
                className="input-field"
                value={form.registrationNumber}
                onChange={(e) => set('registrationNumber', e.target.value)}
                placeholder={t('platform.wizard.placeholder.registrationNumber')}
              />
            </div>
            <div>
              <label className={labelCls}>{t('platform.wizard.country')}</label>
              <select
                className="input-field"
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
              >
                {ALL_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{countryLabel(c.code)}</option>
                ))}
              </select>
              {errors.country && <p className={errCls}>{errors.country}</p>}
            </div>
          </div>
        )}

        {/* Step 2: Admin User */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>{t('platform.wizard.adminName')}</label>
              <input
                className="input-field"
                value={form.adminName}
                onChange={(e) => set('adminName', e.target.value)}
                placeholder={t('platform.wizard.placeholder.adminName')}
              />
              {errors.adminName && <p className={errCls}>{errors.adminName}</p>}
            </div>
            <div>
              <label className={labelCls}>{t('platform.wizard.adminEmail')}</label>
              <input
                className="input-field"
                type="email"
                value={form.adminEmail}
                onChange={(e) => set('adminEmail', e.target.value)}
                placeholder={t('platform.wizard.placeholder.adminEmail')}
              />
              {errors.adminEmail && <p className={errCls}>{errors.adminEmail}</p>}
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>{t('platform.wizard.initialPassword')}</label>
              <input
                className="input-field"
                type="password"
                value={form.adminPassword}
                onChange={(e) => set('adminPassword', e.target.value)}
                placeholder={t('platform.wizard.placeholder.password')}
              />
              {errors.adminPassword && <p className={errCls}>{errors.adminPassword}</p>}
            </div>
          </div>
        )}

        {/* Step 3: Configuration */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>{t('platform.wizard.planTier')}</label>
              <select
                className="input-field"
                value={form.planTier}
                onChange={(e) => set('planTier', e.target.value)}
              >
                <option value="starter">{t('platform.wizard.plan.starter')}</option>
                <option value="professional">{t('platform.wizard.plan.professional')}</option>
                <option value="enterprise">{t('platform.wizard.plan.enterprise')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('platform.wizard.initialSettings')}</label>
              <textarea
                className="w-full glass-input text-sm font-mono"
                rows={6}
                value={form.settings}
                onChange={(e) => set('settings', e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 4: Review & Create */}
        {step === 3 && (
          <div className="space-y-4">
            <ReviewBlock title={t('platform.wizard.review.organization')}>
              <ReviewRow label={t('platform.wizard.review.name')} value={form.name} />
              <ReviewRow label={t('platform.wizard.review.slug')} value={form.slug} mono />
              <ReviewRow
                label={t('platform.wizard.review.country')}
                value={COUNTRY_MAP[form.country]?.name ?? form.country}
              />
              <ReviewRow label={t('platform.wizard.review.plan')} value={form.planTier} capitalize />
              {form.legalName && <ReviewRow label={t('platform.wizard.review.legalName')} value={form.legalName} />}
              {form.registrationNumber && (
                <ReviewRow label={t('platform.wizard.review.regNumber')} value={form.registrationNumber} />
              )}
            </ReviewBlock>

            <ReviewBlock title={t('platform.wizard.review.adminUser')}>
              <ReviewRow label={t('platform.wizard.review.name')} value={form.adminName} />
              <ReviewRow label={t('platform.wizard.review.adminEmail')} value={form.adminEmail} />
            </ReviewBlock>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <div>
          {step > 0 && (
            <button onClick={goBack} className="btn-ghost">
              {t('common.back')}
            </button>
          )}
        </div>
        <div>
          {step < STEPS.length - 1 ? (
            <button onClick={goNext} className="btn-primary">
              {t('common.next')}
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? t('platform.wizard.creating') : t('platform.wizard.createTenant')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-5 space-y-3"
      style={{
        backgroundColor: 'var(--bg-muted)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {title}
      </h4>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">{children}</dl>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {label}
      </dt>
      <dd
        className="text-[color:var(--text-primary)] truncate"
        style={{
          fontFamily: mono ? 'var(--font-geist-mono)' : undefined,
          textTransform: capitalize ? 'capitalize' : undefined,
        }}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
