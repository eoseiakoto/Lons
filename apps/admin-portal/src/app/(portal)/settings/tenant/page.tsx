'use client';

import { useState, useEffect } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/toast';
import { Building2 } from 'lucide-react';

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
      status
      createdAt
    }
  }
`;

const UPDATE_TENANT = gql`
  mutation UpdateTenant($id: ID!, $input: UpdateTenantInput!) {
    updateTenant(id: $id, input: $input) {
      id name slug logoUrl primaryColor timezone defaultCurrency supportEmail supportPhone address
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

const CURRENCIES = ['GHS', 'KES', 'NGN', 'UGX', 'TZS', 'USD'];

const labelCls = 'block text-sm font-medium text-white/60 mb-1';

export default function TenantSettingsPage() {
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

  useEffect(() => {
    if (data?.tenant) {
      const t = data.tenant;
      setForm({
        name: t.name || '',
        logoUrl: t.logoUrl || '',
        primaryColor: t.primaryColor || '#3B82F6',
        timezone: t.timezone || 'Africa/Accra',
        defaultCurrency: t.defaultCurrency || 'GHS',
        supportEmail: t.supportEmail || '',
        supportPhone: t.supportPhone || '',
        address: t.address || '',
      });
    }
  }, [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateTenant({
        variables: {
          id: user?.tenantId,
          input: form,
        },
      });
      toast('success', 'Tenant settings updated');
    } catch (err: any) {
      toast('error', err.message || 'Failed to update settings');
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) return <div className="text-white/40">Loading tenant settings...</div>;

  return (
    <div>
      <button onClick={() => router.push('/settings')} className="text-sm text-blue-400 mb-4 hover:underline">&larr; Back to Settings</button>
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-6 h-6 text-blue-400" />
        <h1 className="text-lg font-semibold text-white/80">Tenant Configuration</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        {/* Organization Info */}
        <div className="glass p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide">Organization</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Organization Name</label>
              <input
                className="w-full glass-input"
                value={form.name}
                onChange={update('name')}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Slug</label>
              <input
                className="w-full glass-input opacity-60"
                value={data?.tenant?.slug || ''}
                disabled
              />
              <p className="text-xs text-white/30 mt-1">Slug cannot be changed after creation</p>
            </div>
          </div>
          <div>
            <label className={labelCls}>Logo URL</label>
            <input
              type="url"
              className="w-full glass-input"
              value={form.logoUrl}
              onChange={update('logoUrl')}
              placeholder="https://example.com/logo.png"
            />
          </div>
          <div className="max-w-xs">
            <label className={labelCls}>Primary Brand Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryColor}
                onChange={update('primaryColor')}
                className="w-10 h-10 rounded cursor-pointer bg-transparent border border-white/10"
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
        <div className="glass p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide">Business Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Default Currency</label>
              <select className="w-full glass-input" value={form.defaultCurrency} onChange={update('defaultCurrency')}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Timezone</label>
              <select className="w-full glass-input" value={form.timezone} onChange={update('timezone')}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Support Contact */}
        <div className="glass p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide">Support Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Support Email</label>
              <input
                type="email"
                className="w-full glass-input"
                value={form.supportEmail}
                onChange={update('supportEmail')}
                placeholder="support@company.com"
              />
            </div>
            <div>
              <label className={labelCls}>Support Phone</label>
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
            <label className={labelCls}>Address</label>
            <textarea
              className="w-full glass-input"
              value={form.address}
              onChange={update('address')}
              rows={2}
              placeholder="Office address"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="glass-button-primary text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
