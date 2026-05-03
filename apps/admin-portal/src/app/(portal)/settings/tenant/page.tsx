'use client';

import { useState, useEffect } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/toast';
import { ArrowLeft } from 'lucide-react';
import { ALL_CURRENCIES, currencyLabel } from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n/i18n-context';

const TENANT_QUERY = gql`
  query Tenant($id: ID!) {
    tenant(id: $id) {
      id
      name
      slug
      logoUrl
      primaryColor
      timezone
      defaultCurrency
      supportEmail
      supportPhone
      address
      settings
      status
      createdAt
    }
  }
`;

const UPDATE_TENANT = gql`
  mutation UpdateTenant($id: ID!, $input: UpdateTenantInput!) {
    updateTenant(id: $id, input: $input) {
      id name slug logoUrl primaryColor timezone defaultCurrency supportEmail supportPhone address settings
    }
  }
`;

const TIMEZONES = [
  'Africa/Accra',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Dar_es_Salaam',
  'Africa/Kampala',
  'UTC',
];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1';

interface SettingsState {
  settlementFrequency: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  workDays: number[];
  sms: boolean;
  email: boolean;
  push: boolean;
  inApp: boolean;
  overdraft: boolean;
  microLoan: boolean;
  bnpl: boolean;
  invoiceFactoring: boolean;
  maxCustomerExposure: string;
  maxCustomerExposureMultiplier: string;
  enableCrossProductCheck: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  settlementFrequency: 'daily',
  businessHoursStart: '08:00',
  businessHoursEnd: '17:00',
  workDays: [1, 2, 3, 4, 5],
  sms: true,
  email: true,
  push: false,
  inApp: true,
  overdraft: true,
  microLoan: true,
  bnpl: false,
  invoiceFactoring: false,
  maxCustomerExposure: '0',
  maxCustomerExposureMultiplier: '0',
  enableCrossProductCheck: true,
};

export default function TenantSettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, loading } = useQuery(TENANT_QUERY, {
    variables: { id: user?.tenantId },
    skip: !user?.tenantId,
  });

  const [updateTenant, { loading: saving }] = useMutation(UPDATE_TENANT);

  const [form, setForm] = useState({
    name: '',
    logoUrl: '',
    primaryColor: '#3B82F6',
    timezone: 'Africa/Accra',
    defaultCurrency: 'GHS',
    supportEmail: '',
    supportPhone: '',
    address: '',
  });

  const [settings, setSettings] = useState<SettingsState>({ ...DEFAULT_SETTINGS });

  useEffect(() => {
    if (data?.tenant) {
      const tenant = data.tenant;
      setForm({
        name: tenant.name || '',
        logoUrl: tenant.logoUrl || '',
        primaryColor: tenant.primaryColor || '#3B82F6',
        timezone: tenant.timezone || 'Africa/Accra',
        defaultCurrency: tenant.defaultCurrency || 'GHS',
        supportEmail: tenant.supportEmail || '',
        supportPhone: tenant.supportPhone || '',
        address: tenant.address || '',
      });

      // Parse settings JSON
      if (tenant.settings && typeof tenant.settings === 'object') {
        const s = tenant.settings as Record<string, any>;
        setSettings({
          settlementFrequency: s.settlementFrequency || 'daily',
          businessHoursStart: s.businessHours?.start || '08:00',
          businessHoursEnd: s.businessHours?.end || '17:00',
          workDays: s.businessHours?.workDays || [1, 2, 3, 4, 5],
          sms: s.notificationChannels?.sms ?? true,
          email: s.notificationChannels?.email ?? true,
          push: s.notificationChannels?.push ?? false,
          inApp: s.notificationChannels?.inApp ?? true,
          overdraft: s.enabledProductTypes?.overdraft ?? true,
          microLoan: s.enabledProductTypes?.microLoan ?? true,
          bnpl: s.enabledProductTypes?.bnpl ?? false,
          invoiceFactoring: s.enabledProductTypes?.invoiceFactoring ?? false,
          maxCustomerExposure: s.exposureRules?.maxCustomerExposure || '0',
          maxCustomerExposureMultiplier: s.exposureRules?.maxCustomerExposureMultiplier || '0',
          enableCrossProductCheck: s.exposureRules?.enableCrossProductCheck ?? true,
        });
      }
    }
  }, [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Build the structured settings object
      const existingSettings = (data?.tenant?.settings && typeof data.tenant.settings === 'object')
        ? data.tenant.settings as Record<string, unknown>
        : {};

      const mergedSettings = {
        ...existingSettings,
        settlementFrequency: settings.settlementFrequency,
        businessHours: {
          start: settings.businessHoursStart,
          end: settings.businessHoursEnd,
          workDays: settings.workDays,
        },
        notificationChannels: {
          sms: settings.sms,
          email: settings.email,
          push: settings.push,
          inApp: settings.inApp,
        },
        enabledProductTypes: {
          overdraft: settings.overdraft,
          microLoan: settings.microLoan,
          bnpl: settings.bnpl,
          invoiceFactoring: settings.invoiceFactoring,
        },
        exposureRules: {
          maxCustomerExposure: settings.maxCustomerExposure,
          maxCustomerExposureMultiplier: settings.maxCustomerExposureMultiplier,
          enableCrossProductCheck: settings.enableCrossProductCheck,
        },
      };

      await updateTenant({
        variables: {
          id: user?.tenantId,
          input: {
            ...form,
            settings: mergedSettings,
          },
        },
      });
      toast('success', t('settings.tenant.toast.updated'));
    } catch (err: any) {
      toast('error', err.message || t('settings.tenant.toast.updateFailed'));
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setSetting = (field: keyof SettingsState, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('settings.tenant.loading')}</div>;

  return (
    <div className="relative space-y-8 animate-enter">
      <button
        onClick={() => router.push('/settings')}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('settings.tenant.backToSettings')}
      </button>

      <PageHeader
        eyebrow={t('eyebrow.configTenant')}
        title={t('settings.tenant.title')}
        subtitle={t('settings.tenant.subtitle')}
      />


      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        {/* Organization Info */}
        <div className="card-glow p-6 space-y-4">
          <h2 className="section-label">{t('settings.tenant.section.organization')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('settings.tenant.field.orgName')}</label>
              <input
                className="w-full glass-input"
                value={form.name}
                onChange={update('name')}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.tenant.field.slug')}</label>
              <input
                className="w-full glass-input opacity-60"
                value={data?.tenant?.slug || ''}
                disabled
              />
              <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('settings.tenant.help.slug')}</p>
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('settings.tenant.field.logoUrl')}</label>
            <input
              type="url"
              className="w-full glass-input"
              value={form.logoUrl}
              onChange={update('logoUrl')}
              placeholder="https://example.com/logo.png"
            />
          </div>
          <div className="max-w-xs">
            <label className={labelCls}>{t('settings.tenant.field.primaryColor')}</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryColor}
                onChange={update('primaryColor')}
                className="w-10 h-10 rounded cursor-pointer bg-transparent border border-[color:var(--border-subtle)]"
              />
              <input
                className="flex-1 glass-input font-mono text-sm"
                value={form.primaryColor}
                onChange={update('primaryColor')}
                placeholder="#3B82F6"
              />
            </div>
          </div>
        </div>

        {/* Business Settings */}
        <div className="card-glow p-6 space-y-4">
          <h2 className="section-label">{t('settings.tenant.section.business')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('settings.tenant.field.defaultCurrency')}</label>
              <select className="w-full glass-input" value={form.defaultCurrency} onChange={update('defaultCurrency')}>
                {ALL_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{currencyLabel(c.code)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('settings.tenant.field.timezone')}</label>
              <select className="w-full glass-input" value={form.timezone} onChange={update('timezone')}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>{t('settings.tenant.field.businessHoursStart')}</label>
              <input type="text" className="w-full glass-input" value={settings.businessHoursStart} onChange={(e) => setSetting('businessHoursStart', e.target.value)} placeholder="08:00" />
            </div>
            <div>
              <label className={labelCls}>{t('settings.tenant.field.businessHoursEnd')}</label>
              <input type="text" className="w-full glass-input" value={settings.businessHoursEnd} onChange={(e) => setSetting('businessHoursEnd', e.target.value)} placeholder="17:00" />
            </div>
            <div>
              <label className={labelCls}>{t('settings.tenant.field.settlementFrequency')}</label>
              <select className="w-full glass-input" value={settings.settlementFrequency} onChange={(e) => setSetting('settlementFrequency', e.target.value)}>
                <option value="daily">{t('settings.tenant.frequency.daily')}</option>
                <option value="weekly">{t('settings.tenant.frequency.weekly')}</option>
                <option value="monthly">{t('settings.tenant.frequency.monthly')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('settings.tenant.field.workDays')}</label>
            <div className="flex gap-3">
              {DAY_KEYS.map((dayKey, i) => (
                <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.workDays.includes(i)}
                    onChange={(e) => {
                      const wd = e.target.checked
                        ? [...settings.workDays, i].sort()
                        : settings.workDays.filter((d) => d !== i);
                      setSetting('workDays', wd);
                    }}
                    className="accent-blue-500 w-4 h-4"
                  />
                  <span className="text-sm text-[color:var(--text-primary)]">{t(`settings.tenant.day.${dayKey}`)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Notification Channels */}
        <div className="card-glow p-6 space-y-4">
          <h2 className="section-label">{t('settings.tenant.section.notificationChannels')}</h2>
          <div className="flex gap-6">
            {([
              { key: 'sms' as const, labelKey: 'settings.tenant.channel.sms' },
              { key: 'email' as const, labelKey: 'settings.tenant.channel.email' },
              { key: 'push' as const, labelKey: 'settings.tenant.channel.push' },
              { key: 'inApp' as const, labelKey: 'settings.tenant.channel.inApp' },
            ]).map((ch) => (
              <label key={ch.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[ch.key]}
                  onChange={(e) => setSetting(ch.key, e.target.checked)}
                  className="accent-blue-500 w-4 h-4"
                />
                <span className="text-sm text-[color:var(--text-primary)]">{t(ch.labelKey)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Enabled Product Types */}
        <div className="card-glow p-6 space-y-4">
          <h2 className="section-label">{t('settings.tenant.section.enabledProducts')}</h2>
          <div className="flex gap-6">
            {([
              { key: 'overdraft' as const, labelKey: 'settings.tenant.product.overdraft' },
              { key: 'microLoan' as const, labelKey: 'settings.tenant.product.microLoan' },
              { key: 'bnpl' as const, labelKey: 'settings.tenant.product.bnpl' },
              { key: 'invoiceFactoring' as const, labelKey: 'settings.tenant.product.invoiceFactoring' },
            ]).map((pt) => (
              <label key={pt.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[pt.key]}
                  onChange={(e) => setSetting(pt.key, e.target.checked)}
                  className="accent-blue-500 w-4 h-4"
                />
                <span className="text-sm text-[color:var(--text-primary)]">{t(pt.labelKey)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Exposure Rules */}
        <div className="card-glow p-6 space-y-4">
          <h2 className="section-label">{t('settings.tenant.section.exposureRules')}</h2>
          <p className="text-xs text-[color:var(--text-tertiary)]">
            {t('settings.tenant.help.exposureRules')}
          </p>
          <div className="flex items-center gap-3 mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableCrossProductCheck}
                onChange={(e) => setSetting('enableCrossProductCheck', e.target.checked)}
                className="accent-blue-500 w-4 h-4"
              />
              <span className="text-sm text-[color:var(--text-primary)]">{t('settings.tenant.field.enableCrossProductCheck')}</span>
            </label>
          </div>
          {settings.enableCrossProductCheck && (
            <>
              <div className="max-w-sm">
                <label className={labelCls}>{t('settings.tenant.field.maxCustomerExposure')}</label>
                <input
                  type="text"
                  className="w-full glass-input"
                  value={settings.maxCustomerExposure}
                  onChange={(e) => setSetting('maxCustomerExposure', e.target.value)}
                  placeholder="500000.00"
                />
                <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
                  {t('settings.tenant.help.maxCustomerExposure')}
                </p>
              </div>
              <div>
                <label className={labelCls}>{t('settings.tenant.field.maxExposureMultiplier')}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={settings.maxCustomerExposureMultiplier}
                  onChange={(e) => setSettings((s) => ({ ...s, maxCustomerExposureMultiplier: e.target.value }))}
                  className="glass-input w-full"
                  placeholder={t('settings.tenant.placeholder.zeroToDisable')}
                />
                <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('settings.tenant.help.maxExposureMultiplier')}</p>
              </div>
            </>
          )}
        </div>

        {/* Support Contact */}
        <div className="card-glow p-6 space-y-4">
          <h2 className="section-label">{t('settings.tenant.section.supportContact')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('settings.tenant.field.supportEmail')}</label>
              <input
                type="email"
                className="w-full glass-input"
                value={form.supportEmail}
                onChange={update('supportEmail')}
                placeholder="support@company.com"
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.tenant.field.supportPhone')}</label>
              <input
                type="tel"
                className="w-full glass-input"
                value={form.supportPhone}
                onChange={update('supportPhone')}
                placeholder="+233 XX XXX XXXX"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('settings.tenant.field.address')}</label>
            <textarea
              className="w-full glass-input"
              value={form.address}
              onChange={update('address')}
              rows={2}
              placeholder={t('settings.tenant.placeholder.officeAddress')}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="glass-button-primary text-sm disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('settings.tenant.saveChanges')}
          </button>
        </div>
      </form>
    </div>
  );
}
