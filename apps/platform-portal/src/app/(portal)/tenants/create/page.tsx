'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gql, useMutation } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  User,
  Settings,
  ClipboardCheck,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRIMARY_COUNTRY_LIST,
  AFRICAN_COUNTRY_LIST,
  ALL_COUNTRIES,
} from '@/lib/constants/countries';
import {
  PRIMARY_CURRENCY_LIST,
  AFRICAN_CURRENCY_LIST,
  ALL_CURRENCIES,
} from '@/lib/constants/currencies';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { ProgressBar } from '@/components/ui/progress-bar';

const CREATE_TENANT = gql`
  mutation CreateTenant($input: CreateTenantInput!) {
    createTenant(input: $input) {
      id
      name
      slug
      status
    }
  }
`;

interface SettingsForm {
  defaultCurrency: string;
  timezone: string;
  locale: string;
  dateFormat: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  workDays: number[];
  settlementFrequency: string;
  sms: boolean;
  email: boolean;
  push: boolean;
  inApp: boolean;
  overdraft: boolean;
  microLoan: boolean;
  bnpl: boolean;
  invoiceFactoring: boolean;
  primaryColor: string;
  logoUrl: string;
  portalTitle: string;
  regulatoryJurisdiction: string;
  dataResidencyRegion: string;
  customOverrides: string;
}

interface FormData {
  name: string;
  slug: string;
  legalName: string;
  registrationNumber: string;
  country: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  planTier: string;
  platformFeePercent: string;
  settings: SettingsForm;
}

const DEFAULT_SETTINGS: SettingsForm = {
  defaultCurrency: 'GHS',
  timezone: 'Africa/Accra',
  locale: 'en',
  dateFormat: 'DD/MM/YYYY',
  businessHoursStart: '08:00',
  businessHoursEnd: '17:00',
  workDays: [1, 2, 3, 4, 5],
  settlementFrequency: 'daily',
  sms: true,
  email: true,
  push: false,
  inApp: true,
  overdraft: true,
  microLoan: true,
  bnpl: false,
  invoiceFactoring: false,
  primaryColor: '#1FE08A',
  logoUrl: '',
  portalTitle: '',
  regulatoryJurisdiction: '',
  dataResidencyRegion: '',
  customOverrides: '{}',
};

const INITIAL: FormData = {
  name: '',
  slug: '',
  legalName: '',
  registrationNumber: '',
  country: 'GH',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  planTier: 'starter',
  platformFeePercent: '',
  settings: { ...DEFAULT_SETTINGS },
};

const TIMEZONES = [
  'Africa/Accra',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Dar_es_Salaam',
  'Africa/Kampala',
  'Africa/Cairo',
  'UTC',
];
const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ha', label: 'Hausa' },
  { value: 'sw', label: 'Swahili' },
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STEPS = [
  {
    title: 'Basics',
    description: 'Organization profile',
    icon: Building2,
  },
  {
    title: 'Admin user',
    description: 'Initial owner account',
    icon: User,
  },
  {
    title: 'Configuration',
    description: 'Plan, locale, products, branding',
    icon: Settings,
  },
  {
    title: 'Review',
    description: 'Confirm and provision',
    icon: ClipboardCheck,
  },
];

const autoSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);

export default function CreateTenantPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  const [createTenant, { loading }] = useMutation(CREATE_TENANT);

  const set = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const n = { ...prev };
      delete n[field];
      return n;
    });
  };

  const setSetting = (field: keyof SettingsForm, value: unknown) => {
    setForm((prev) => ({ ...prev, settings: { ...prev.settings, [field]: value } }));
  };

  const validate = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!form.name.trim()) errs.name = 'Name is required';
      if (!form.slug.trim()) errs.slug = 'Slug is required';
      if (!form.country.trim()) errs.country = 'Country is required';
    } else if (s === 1) {
      if (!form.adminName.trim()) errs.adminName = 'Name is required';
      if (!form.adminEmail.trim()) errs.adminEmail = 'Email is required';
      if (form.adminPassword.length < 12)
        errs.adminPassword = 'Min 12 chars, uppercase, lowercase, digit, special';
      else if (!/[A-Z]/.test(form.adminPassword))
        errs.adminPassword = 'Must include an uppercase letter';
      else if (!/[a-z]/.test(form.adminPassword))
        errs.adminPassword = 'Must include a lowercase letter';
      else if (!/[0-9]/.test(form.adminPassword))
        errs.adminPassword = 'Must include a digit';
      else if (!/[^A-Za-z0-9]/.test(form.adminPassword))
        errs.adminPassword = 'Must include a special character';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (validate(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validate(0) || !validate(1)) return;
    setSubmitError('');
    try {
      const s = form.settings;
      let customOverrides: Record<string, unknown> | undefined;
      try {
        const parsed = JSON.parse(s.customOverrides);
        if (typeof parsed === 'object' && parsed !== null) customOverrides = parsed;
      } catch {
        /* ignore */
      }

      const settings = {
        defaultCurrency: s.defaultCurrency,
        timezone: s.timezone,
        locale: s.locale,
        dateFormat: s.dateFormat,
        businessHours: {
          start: s.businessHoursStart,
          end: s.businessHoursEnd,
          workDays: s.workDays,
        },
        settlementFrequency: s.settlementFrequency,
        notificationChannels: {
          sms: s.sms,
          email: s.email,
          push: s.push,
          inApp: s.inApp,
        },
        enabledProductTypes: {
          overdraft: s.overdraft,
          microLoan: s.microLoan,
          bnpl: s.bnpl,
          invoiceFactoring: s.invoiceFactoring,
        },
        branding: {
          primaryColor: s.primaryColor,
          logoUrl: s.logoUrl || undefined,
          portalTitle: s.portalTitle || undefined,
        },
        regulatoryJurisdiction: s.regulatoryJurisdiction || undefined,
        dataResidencyRegion: s.dataResidencyRegion || undefined,
        customOverrides,
      };

      const { data } = await createTenant({
        variables: {
          input: {
            name: form.name,
            slug: form.slug,
            legalName: form.legalName || undefined,
            registrationNumber: form.registrationNumber || undefined,
            country: form.country,
            planTier: form.planTier,
            platformFeePercent: form.platformFeePercent || undefined,
            adminName: form.adminName,
            adminEmail: form.adminEmail,
            adminPassword: form.adminPassword,
            settings,
          },
        },
      });
      if (data?.createTenant?.id) {
        router.push(`/tenants/${data.createTenant.id}`);
      } else {
        router.push('/tenants');
      }
    } catch (err: any) {
      setSubmitError(
        err?.graphQLErrors?.[0]?.message || err?.message || 'Failed to create tenant',
      );
    }
  };

  const completionPct = useMemo(() => {
    let filled = 0;
    let total = 0;
    const reqFields = [
      form.name,
      form.slug,
      form.country,
      form.adminName,
      form.adminEmail,
      form.adminPassword,
    ];
    reqFields.forEach((f) => {
      total += 1;
      if (f && f.trim().length > 0) filled += 1;
    });
    return Math.round((filled / total) * 100);
  }, [form]);

  const enabledProductCount = [
    form.settings.overdraft,
    form.settings.microLoan,
    form.settings.bnpl,
    form.settings.invoiceFactoring,
  ].filter(Boolean).length;

  const enabledChannelCount = [
    form.settings.sms,
    form.settings.email,
    form.settings.push,
    form.settings.inApp,
  ].filter(Boolean).length;

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between">
        <button
          onClick={() => router.push('/tenants')}
          className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All tenants
        </button>
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--text-tertiary)]">
          <Sparkles className="w-3 h-3 text-[color:var(--accent-primary-deep)]" />
          New tenant provisioning
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="live-dot" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
            Step {step + 1} of {STEPS.length} · {STEPS[step].title}
          </span>
        </div>
        <h1
          className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
          style={{ fontSize: 44, lineHeight: 1.05 }}
        >
          {form.name || 'New tenant'}
        </h1>
        <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
          {STEPS[step].description}.
        </p>
      </header>

      {/* Wizard grid */}
      <section className="relative z-10 grid grid-cols-12 gap-6">
        {/* Stepper rail */}
        <aside className="col-span-12 lg:col-span-3 lg:sticky lg:top-6 self-start">
          <div className="card-glow p-5">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
                Progress
              </span>
              <span className="text-[12px] tabular-nums text-[color:var(--accent-primary-deep)] font-semibold">
                {completionPct}%
              </span>
            </div>
            <ProgressBar value={completionPct} max={100} size="sm" className="mb-5" />

            <ol className="space-y-1">
              {STEPS.map((s, i) => {
                const isActive = i === step;
                const isComplete = i < step;
                const Icon = s.icon;
                const clickable = i <= step;
                return (
                  <li key={i}>
                    <button
                      disabled={!clickable}
                      onClick={() => clickable && setStep(i)}
                      className={cn(
                        'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors relative',
                        clickable
                          ? 'cursor-pointer hover:bg-[color:var(--bg-hover)]'
                          : 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                        )}
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
                                }
                              : {
                                  backgroundColor: 'var(--bg-muted)',
                                  color: 'var(--text-tertiary)',
                                  border: '1px solid var(--border-subtle)',
                                }
                        }
                      >
                        {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[13px] font-medium"
                          style={{
                            color: isActive
                              ? 'var(--text-primary)'
                              : 'var(--text-secondary)',
                          }}
                        >
                          {s.title}
                        </div>
                        <div className="text-[11px] text-[color:var(--text-tertiary)] truncate">
                          {s.description}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Side-rail summary */}
          <div className="card-glow p-5 mt-3">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] mb-3">
              Summary
            </h4>
            <dl className="space-y-2.5 text-[12px]">
              <SummaryRow label="Slug" value={form.slug || '—'} mono />
              <SummaryRow label="Country" value={form.country || '—'} />
              <SummaryRow label="Plan" value={form.planTier} capitalize />
              {form.platformFeePercent && (
                <SummaryRow label="Platform fee" value={`${form.platformFeePercent}%`} />
              )}
              <SummaryRow label="Currency" value={form.settings.defaultCurrency} />
              <SummaryRow label="Locale" value={form.settings.locale.toUpperCase()} />
              <SummaryRow label="Timezone" value={form.settings.timezone} />
              <SummaryRow label="Products" value={`${enabledProductCount} enabled`} />
              <SummaryRow label="Channels" value={`${enabledChannelCount} enabled`} />
              <SummaryRow label="Settlement" value={form.settings.settlementFrequency} capitalize />
            </dl>
          </div>
        </aside>

        {/* Step content */}
        <div className="col-span-12 lg:col-span-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="card-glow card-glow-sweep p-6 lg:p-8"
            >
              {step === 0 && (
                <Section
                  eyebrow="01 · Organization"
                  title="Tell us about the tenant"
                  hint="Public-facing details and the slug used for routing & API auth."
                >
                  <Grid cols={2}>
                    <Field
                      label="Organization name"
                      required
                      error={errors.name}
                      value={form.name}
                      onChange={(v) => {
                        set('name', v);
                        if (!form.slug || form.slug === autoSlug(form.name)) {
                          set('slug', autoSlug(v));
                        }
                      }}
                      placeholder="Acme Financial Services"
                    />
                    <Field
                      label="Slug"
                      required
                      mono
                      error={errors.slug}
                      value={form.slug}
                      onChange={(v) => set('slug', v)}
                      placeholder="acme-financial"
                    />
                    <Field
                      label="Legal name"
                      value={form.legalName}
                      onChange={(v) => set('legalName', v)}
                      placeholder="Acme Financial Services Ltd."
                    />
                    <Field
                      label="Registration number"
                      value={form.registrationNumber}
                      onChange={(v) => set('registrationNumber', v)}
                      placeholder="REG-12345"
                    />
                    <SelectField
                      label="Country"
                      required
                      error={errors.country}
                      value={form.country}
                      onChange={(v) => set('country', v)}
                      groups={[
                        {
                          label: 'Primary markets',
                          options: PRIMARY_COUNTRY_LIST.map((c) => ({
                            value: c.code,
                            label: `${c.flag} ${c.name} (${c.code})`,
                          })),
                        },
                        {
                          label: 'Other African',
                          options: AFRICAN_COUNTRY_LIST.filter((c) => !c.primary).map((c) => ({
                            value: c.code,
                            label: `${c.flag} ${c.name} (${c.code})`,
                          })),
                        },
                        {
                          label: 'Global',
                          options: ALL_COUNTRIES.filter(
                            (c) => !AFRICAN_COUNTRY_LIST.some((ac) => ac.code === c.code),
                          ).map((c) => ({
                            value: c.code,
                            label: `${c.flag} ${c.name} (${c.code})`,
                          })),
                        },
                      ]}
                    />
                  </Grid>
                </Section>
              )}

              {step === 1 && (
                <Section
                  eyebrow="02 · Admin user"
                  title="Initial owner account"
                  hint="The first user account for this tenant. They&apos;ll be invited to log in."
                >
                  <Grid cols={2}>
                    <Field
                      label="Admin name"
                      required
                      error={errors.adminName}
                      value={form.adminName}
                      onChange={(v) => set('adminName', v)}
                      placeholder="Aminata Cisse"
                    />
                    <Field
                      label="Admin email"
                      required
                      type="email"
                      error={errors.adminEmail}
                      value={form.adminEmail}
                      onChange={(v) => set('adminEmail', v)}
                      placeholder="aminata@acme.com"
                    />
                    <Field
                      label="Initial password"
                      required
                      type="password"
                      span={2}
                      error={errors.adminPassword}
                      value={form.adminPassword}
                      onChange={(v) => set('adminPassword', v)}
                      placeholder="Min 12 chars · upper · lower · digit · special"
                      helper="The user will be required to rotate this on first sign-in."
                    />
                  </Grid>
                </Section>
              )}

              {step === 2 && (
                <Section
                  eyebrow="03 · Configuration"
                  title="Plan, locale, products, branding"
                  hint="Defaults below — every value is editable later in tenant settings."
                >
                  <Grid cols={2}>
                    <SelectField
                      label="Plan tier"
                      value={form.planTier}
                      onChange={(v) => set('planTier', v)}
                      options={[
                        { value: 'starter', label: 'Starter' },
                        { value: 'professional', label: 'Professional' },
                        { value: 'enterprise', label: 'Enterprise' },
                      ]}
                    />
                    <Field
                      label="Platform fee percent"
                      suffix="%"
                      value={form.platformFeePercent}
                      onChange={(v) => set('platformFeePercent', v)}
                      placeholder="e.g. 2.50"
                    />
                  </Grid>

                  <SubSection title="Regional & locale">
                    <Grid cols={4}>
                      <SelectField
                        label="Currency"
                        value={form.settings.defaultCurrency}
                        onChange={(v) => setSetting('defaultCurrency', v)}
                        groups={[
                          {
                            label: 'Primary',
                            options: PRIMARY_CURRENCY_LIST.map((c) => ({
                              value: c.code,
                              label: `${c.code} — ${c.symbol}`,
                            })),
                          },
                          {
                            label: 'Other African',
                            options: AFRICAN_CURRENCY_LIST.filter((c) => !c.primary).map((c) => ({
                              value: c.code,
                              label: `${c.code} — ${c.symbol}`,
                            })),
                          },
                          {
                            label: 'Global',
                            options: ALL_CURRENCIES.filter(
                              (c) => !AFRICAN_CURRENCY_LIST.some((ac) => ac.code === c.code),
                            ).map((c) => ({ value: c.code, label: `${c.code} — ${c.symbol}` })),
                          },
                        ]}
                      />
                      <SelectField
                        label="Timezone"
                        value={form.settings.timezone}
                        onChange={(v) => setSetting('timezone', v)}
                        options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                      />
                      <SelectField
                        label="Locale"
                        value={form.settings.locale}
                        onChange={(v) => setSetting('locale', v)}
                        options={LOCALES.map((l) => ({ value: l.value, label: l.label }))}
                      />
                      <SelectField
                        label="Date format"
                        value={form.settings.dateFormat}
                        onChange={(v) => setSetting('dateFormat', v)}
                        options={[
                          { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                          { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                          { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                        ]}
                      />
                    </Grid>
                  </SubSection>

                  <SubSection title="Business operations">
                    <Grid cols={3}>
                      <Field
                        label="Hours start"
                        value={form.settings.businessHoursStart}
                        onChange={(v) => setSetting('businessHoursStart', v)}
                        placeholder="08:00"
                      />
                      <Field
                        label="Hours end"
                        value={form.settings.businessHoursEnd}
                        onChange={(v) => setSetting('businessHoursEnd', v)}
                        placeholder="17:00"
                      />
                      <SelectField
                        label="Settlement"
                        value={form.settings.settlementFrequency}
                        onChange={(v) => setSetting('settlementFrequency', v)}
                        options={[
                          { value: 'daily', label: 'Daily' },
                          { value: 'weekly', label: 'Weekly' },
                          { value: 'monthly', label: 'Monthly' },
                        ]}
                      />
                    </Grid>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2">
                        Work days
                      </p>
                      <div className="flex gap-1.5">
                        {DAY_NAMES.map((day, i) => {
                          const checked = form.settings.workDays.includes(i);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                const wd = checked
                                  ? form.settings.workDays.filter((d) => d !== i)
                                  : [...form.settings.workDays, i].sort();
                                setSetting('workDays', wd);
                              }}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                              style={{
                                backgroundColor: checked
                                  ? 'var(--accent-primary-soft)'
                                  : 'var(--bg-muted)',
                                color: checked
                                  ? 'var(--accent-primary-deep)'
                                  : 'var(--text-tertiary)',
                                border: `1px solid ${checked ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                              }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </SubSection>

                  <SubSection title="Notification channels">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          { key: 'sms', label: 'SMS' },
                          { key: 'email', label: 'Email' },
                          { key: 'push', label: 'Push' },
                          { key: 'inApp', label: 'In-app' },
                        ] as const
                      ).map((ch) => (
                        <ToggleCard
                          key={ch.key}
                          checked={form.settings[ch.key]}
                          onToggle={() => setSetting(ch.key, !form.settings[ch.key])}
                          label={ch.label}
                        />
                      ))}
                    </div>
                  </SubSection>

                  <SubSection title="Enabled product types">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          { key: 'overdraft', label: 'Overdraft' },
                          { key: 'microLoan', label: 'Micro loan' },
                          { key: 'bnpl', label: 'BNPL' },
                          { key: 'invoiceFactoring', label: 'Invoice factoring' },
                        ] as const
                      ).map((pt) => (
                        <ToggleCard
                          key={pt.key}
                          checked={form.settings[pt.key]}
                          onToggle={() => setSetting(pt.key, !form.settings[pt.key])}
                          label={pt.label}
                        />
                      ))}
                    </div>
                  </SubSection>

                  <SubSection title="Branding">
                    <Grid cols={3}>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
                          Primary color
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={form.settings.primaryColor}
                            onChange={(e) => setSetting('primaryColor', e.target.value)}
                            className="w-10 h-10 rounded-lg cursor-pointer bg-transparent"
                            style={{ border: '1px solid var(--border-subtle)' }}
                          />
                          <input
                            className="input-field font-mono text-sm flex-1"
                            value={form.settings.primaryColor}
                            onChange={(e) => setSetting('primaryColor', e.target.value)}
                          />
                        </div>
                      </div>
                      <Field
                        label="Logo URL"
                        type="url"
                        value={form.settings.logoUrl}
                        onChange={(v) => setSetting('logoUrl', v)}
                        placeholder="https://…"
                      />
                      <Field
                        label="Portal title"
                        value={form.settings.portalTitle}
                        onChange={(v) => setSetting('portalTitle', v)}
                        placeholder="Optional override"
                      />
                    </Grid>
                  </SubSection>

                  <SubSection title="Regulatory">
                    <Grid cols={2}>
                      <Field
                        label="Jurisdiction"
                        value={form.settings.regulatoryJurisdiction}
                        onChange={(v) => setSetting('regulatoryJurisdiction', v)}
                        placeholder="e.g. Bank of Ghana"
                      />
                      <Field
                        label="Data residency region"
                        value={form.settings.dataResidencyRegion}
                        onChange={(v) => setSetting('dataResidencyRegion', v)}
                        placeholder="e.g. West Africa"
                      />
                    </Grid>
                  </SubSection>

                  <details className="group">
                    <summary className="cursor-pointer select-none text-[12px] font-medium text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded transition-transform group-open:rotate-90">
                        <ArrowRight className="w-3 h-3" />
                      </span>
                      Advanced JSON overrides
                    </summary>
                    <div className="mt-3 pl-6">
                      <p className="text-[11px] text-[color:var(--text-tertiary)] mb-2">
                        Custom JSON merged with structured fields (structured fields take precedence).
                      </p>
                      <textarea
                        className="input-field text-sm font-mono"
                        rows={4}
                        value={form.settings.customOverrides}
                        onChange={(e) => setSetting('customOverrides', e.target.value)}
                      />
                    </div>
                  </details>
                </Section>
              )}

              {step === 3 && (
                <Section
                  eyebrow="04 · Review"
                  title="Confirm and provision"
                  hint="Creates the tenant, 5 default system roles, and the admin user."
                >
                  <ReviewBlock
                    title="Organization"
                    onEdit={() => setStep(0)}
                    items={[
                      ['Name', form.name],
                      ['Slug', form.slug],
                      ['Country', form.country],
                      ['Plan', form.planTier],
                      ['Platform fee', form.platformFeePercent ? `${form.platformFeePercent}%` : '—'],
                      form.legalName ? ['Legal name', form.legalName] : null,
                      form.registrationNumber ? ['Reg #', form.registrationNumber] : null,
                    ].filter(Boolean) as [string, string][]}
                  />
                  <ReviewBlock
                    title="Admin user"
                    onEdit={() => setStep(1)}
                    items={[
                      ['Name', form.adminName],
                      ['Email', form.adminEmail],
                    ]}
                  />
                  <ReviewBlock
                    title="Configuration"
                    onEdit={() => setStep(2)}
                    items={[
                      ['Currency', form.settings.defaultCurrency],
                      ['Timezone', form.settings.timezone],
                      ['Locale', form.settings.locale.toUpperCase()],
                      ['Settlement', form.settings.settlementFrequency],
                      ['Hours', `${form.settings.businessHoursStart}–${form.settings.businessHoursEnd}`],
                      ['Products', `${enabledProductCount}/4 enabled`],
                      ['Channels', `${enabledChannelCount}/4 enabled`],
                    ]}
                  />
                </Section>
              )}

              {submitError && (
                <div
                  className="mt-4 px-4 py-2.5 rounded-lg text-[13px] flex items-center gap-2"
                  style={{
                    backgroundColor: 'var(--status-error-soft)',
                    color: 'var(--status-error-text)',
                    border: '1px solid var(--status-error)',
                  }}
                >
                  <AlertTriangle className="w-4 h-4" />
                  {submitError}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Footer nav */}
          <div className="flex items-center justify-between mt-6">
            <button onClick={goBack} disabled={step === 0} className="btn-ghost disabled:opacity-30">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={goNext} className="btn-primary">
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="btn-primary disabled:opacity-50">
                <Sparkles className="w-4 h-4" />
                {loading ? 'Provisioning…' : 'Create tenant'}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--accent-primary-deep)] mb-1.5">
          {eyebrow}
        </p>
        <h2 className="text-[22px] font-semibold tracking-tight text-[color:var(--text-primary)]">
          {title}
        </h2>
        {hint && (
          <p className="text-[13px] text-[color:var(--text-tertiary)] mt-1.5">{hint}</p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="space-y-3 pt-5"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      <h3 className="text-[12px] font-medium uppercase tracking-wider text-[color:var(--text-secondary)]">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  const map: Record<number, string> = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  };
  return <div className={cn('grid gap-4', map[cols])}>{children}</div>;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'url';
  required?: boolean;
  error?: string;
  helper?: string;
  suffix?: string;
  mono?: boolean;
  span?: 1 | 2;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  error,
  helper,
  suffix,
  mono,
  span,
}: FieldProps) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : undefined}>
      <label className="block text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
        {label} {required && <span className="text-[color:var(--accent-primary-deep)]">*</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          className={cn('input-field', mono && 'font-mono', suffix && 'pr-8')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] text-sm">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-[color:var(--status-error-text)] mt-1.5 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
      {!error && helper && (
        <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1.5">{helper}</p>
      )}
    </div>
  );
}

interface SelectGroup {
  label: string;
  options: { value: string; label: string }[];
}
interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: { value: string; label: string }[];
  groups?: SelectGroup[];
  required?: boolean;
  error?: string;
}
function SelectField({
  label,
  value,
  onChange,
  options,
  groups,
  required,
  error,
}: SelectFieldProps) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
        {label} {required && <span className="text-[color:var(--accent-primary-deep)]">*</span>}
      </label>
      <select
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!required && <option value="">—</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {groups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && (
        <p className="text-[11px] text-[color:var(--status-error-text)] mt-1.5 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function ToggleCard({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
      style={{
        backgroundColor: checked ? 'var(--accent-primary-soft)' : 'var(--bg-card)',
        border: `1px solid ${checked ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        color: checked ? 'var(--accent-primary-deep)' : 'var(--text-secondary)',
      }}
    >
      <span>{label}</span>
      <span
        className="w-4 h-4 rounded flex items-center justify-center"
        style={{
          backgroundColor: checked ? 'var(--accent-primary)' : 'transparent',
          border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-strong)'}`,
        }}
      >
        {checked && <Check className="w-3 h-3 text-[color:var(--text-on-accent)]" />}
      </span>
    </button>
  );
}

function ReviewBlock({
  title,
  items,
  onEdit,
}: {
  title: string;
  items: [string, string][];
  onEdit: () => void;
}) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        backgroundColor: 'var(--bg-muted)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-[13px] font-semibold text-[color:var(--text-primary)]">{title}</h4>
        <button
          onClick={onEdit}
          className="text-[12px] text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] transition-colors"
        >
          Edit
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
        {items.map(([k, v], i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
              {k}
            </dt>
            <dd className="text-[color:var(--text-primary)] truncate">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SummaryRow({
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
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[color:var(--text-tertiary)]">{label}</dt>
      <dd
        className={cn(
          'text-[color:var(--text-primary)] truncate text-right',
          mono && 'font-mono',
          capitalize && 'capitalize',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
