'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface WizardStep {
  title: string;
  description: string;
}

const STEPS: WizardStep[] = [
  { title: 'Basic Info', description: 'Organization details' },
  { title: 'Admin User', description: 'Initial admin account' },
  { title: 'Configuration', description: 'Platform settings' },
  { title: 'Review & Create', description: 'Confirm and create' },
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
      if (!form.name.trim()) errs.name = 'Name is required';
      if (!form.slug.trim()) errs.slug = 'Slug is required';
      if (!form.country.trim()) errs.country = 'Country is required';
    } else if (s === 1) {
      if (!form.adminEmail.trim()) errs.adminEmail = 'Email is required';
      if (!form.adminName.trim()) errs.adminName = 'Name is required';
      if (form.adminPassword.length < 8) errs.adminPassword = 'Password must be at least 8 characters';
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

  const labelCls = 'block text-sm font-medium text-white/60 mb-1';
  const errCls = 'text-xs text-red-400 mt-1';

  return (
    <div>
      {/* Progress indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                i === step
                  ? 'bg-blue-500/80 text-white border border-blue-400/50'
                  : i < step
                    ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 cursor-pointer'
                    : 'bg-white/5 text-white/30 border border-white/10',
              )}
            >
              {i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-12 h-px mx-1',
                  i < step ? 'bg-emerald-500/40' : 'bg-white/10',
                )}
              />
            )}
          </div>
        ))}
      </div>

      <div className="glass p-6">
        <h3 className="text-lg font-semibold text-white/80 mb-1">{STEPS[step].title}</h3>
        <p className="text-sm text-white/40 mb-6">{STEPS[step].description}</p>

        {/* Step 1: Basic Info */}
        {step === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Organization Name *</label>
              <input
                className="w-full glass-input"
                value={form.name}
                onChange={(e) => {
                  set('name', e.target.value);
                  if (!form.slug || form.slug === autoSlug(form.name)) {
                    set('slug', autoSlug(e.target.value));
                  }
                }}
                placeholder="Acme Financial Services"
              />
              {errors.name && <p className={errCls}>{errors.name}</p>}
            </div>
            <div>
              <label className={labelCls}>Slug *</label>
              <input
                className="w-full glass-input"
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="acme-financial"
              />
              {errors.slug && <p className={errCls}>{errors.slug}</p>}
            </div>
            <div>
              <label className={labelCls}>Legal Name</label>
              <input
                className="w-full glass-input"
                value={form.legalName}
                onChange={(e) => set('legalName', e.target.value)}
                placeholder="Acme Financial Services Ltd."
              />
            </div>
            <div>
              <label className={labelCls}>Registration Number</label>
              <input
                className="w-full glass-input"
                value={form.registrationNumber}
                onChange={(e) => set('registrationNumber', e.target.value)}
                placeholder="REG-12345"
              />
            </div>
            <div>
              <label className={labelCls}>Country Code *</label>
              <input
                className="w-full glass-input"
                value={form.country}
                onChange={(e) => set('country', e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="GH"
              />
              {errors.country && <p className={errCls}>{errors.country}</p>}
            </div>
          </div>
        )}

        {/* Step 2: Admin User */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Admin Name *</label>
              <input
                className="w-full glass-input"
                value={form.adminName}
                onChange={(e) => set('adminName', e.target.value)}
                placeholder="John Doe"
              />
              {errors.adminName && <p className={errCls}>{errors.adminName}</p>}
            </div>
            <div>
              <label className={labelCls}>Admin Email *</label>
              <input
                className="w-full glass-input"
                type="email"
                value={form.adminEmail}
                onChange={(e) => set('adminEmail', e.target.value)}
                placeholder="admin@acme.com"
              />
              {errors.adminEmail && <p className={errCls}>{errors.adminEmail}</p>}
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Initial Password *</label>
              <input
                className="w-full glass-input"
                type="password"
                value={form.adminPassword}
                onChange={(e) => set('adminPassword', e.target.value)}
                placeholder="Minimum 8 characters"
              />
              {errors.adminPassword && <p className={errCls}>{errors.adminPassword}</p>}
            </div>
          </div>
        )}

        {/* Step 3: Configuration */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>Plan Tier</label>
              <select
                className="w-full glass-input"
                value={form.planTier}
                onChange={(e) => set('planTier', e.target.value)}
              >
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Initial Settings (JSON)</label>
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
          <div className="space-y-5">
            <div className="glass p-4 space-y-3">
              <h4 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Organization</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-white/40">Name:</span>{' '}
                  <span className="text-white">{form.name}</span>
                </div>
                <div>
                  <span className="text-white/40">Slug:</span>{' '}
                  <span className="text-white">{form.slug}</span>
                </div>
                <div>
                  <span className="text-white/40">Country:</span>{' '}
                  <span className="text-white">{form.country}</span>
                </div>
                <div>
                  <span className="text-white/40">Plan:</span>{' '}
                  <span className="text-white capitalize">{form.planTier}</span>
                </div>
                {form.legalName && (
                  <div>
                    <span className="text-white/40">Legal Name:</span>{' '}
                    <span className="text-white">{form.legalName}</span>
                  </div>
                )}
                {form.registrationNumber && (
                  <div>
                    <span className="text-white/40">Reg #:</span>{' '}
                    <span className="text-white">{form.registrationNumber}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="glass p-4 space-y-3">
              <h4 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Admin User</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-white/40">Name:</span>{' '}
                  <span className="text-white">{form.adminName}</span>
                </div>
                <div>
                  <span className="text-white/40">Email:</span>{' '}
                  <span className="text-white">{form.adminEmail}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <div>
          {step > 0 && (
            <button onClick={goBack} className="glass-button text-sm">
              Back
            </button>
          )}
        </div>
        <div>
          {step < STEPS.length - 1 ? (
            <button onClick={goNext} className="glass-button-primary text-sm">
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="glass-button-primary text-sm disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Tenant'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
