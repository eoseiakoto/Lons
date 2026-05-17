'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * S17-2 / FR-DI-001.2 — Admin portal page for managing EMI integration
 * configs (data-pull credentials, field mappings, sync cadence).
 *
 * Follows the same pattern as `settings/integrations/page.tsx`
 * (wallet provider configs).
 */

interface EmiIntegrationConfig {
  id: string;
  name: string;
  provider: string;
  credentialsSet: boolean;
  baseUrl?: string;
  fieldMappings?: Record<string, unknown>;
  syncFrequencyMin: number;
  isActive: boolean;
  lastSyncAt?: string;
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
}

const PROVIDERS = ['mtn_momo', 'mpesa', 'airtel_money', 'generic', 'mock'];

const DEFAULT_FORM = {
  name: '',
  provider: 'mtn_momo',
  credentialsJson: '{}',
  baseUrl: '',
  fieldMappingsJson: '{}',
  syncFrequencyMin: 360,
};

export default function EmiIntegrationsPage() {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<EmiIntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query {
            emiIntegrationConfigs {
              id name provider credentialsSet baseUrl fieldMappings
              syncFrequencyMin isActive lastSyncAt lastSyncError
              createdAt updatedAt
            }
          }`,
        }),
      });
      const { data } = await res.json();
      setConfigs(data?.emiIntegrationConfigs ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleTestConnection = async (configId: string) => {
    setTestingId(configId);
    setTestResult(null);
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation TestEmi($id: ID!) {
            testEmiConnection(id: $id) { success latencyMs errorMessage }
          }`,
          variables: { id: configId },
        }),
      });
      const { data } = await res.json();
      setTestResult(data?.testEmiConnection ?? null);
    } catch {
      setTestResult({ success: false, latencyMs: 0, errorMessage: 'request_failed' });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeactivate = async (configId: string) => {
    await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Deactivate($id: ID!) {
          deactivateEmiIntegrationConfig(id: $id) { id isActive }
        }`,
        variables: { id: configId },
      }),
    });
    fetchConfigs();
  };

  const handleCreate = async () => {
    setFormError(null);
    let credentials: Record<string, unknown> | null = null;
    let fieldMappings: Record<string, unknown> | null = null;
    try {
      credentials = form.credentialsJson.trim()
        ? JSON.parse(form.credentialsJson)
        : null;
      fieldMappings = form.fieldMappingsJson.trim()
        ? JSON.parse(form.fieldMappingsJson)
        : null;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }

    const res = await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Create($input: CreateEmiIntegrationConfigInput!) {
          createEmiIntegrationConfig(input: $input) { id }
        }`,
        variables: {
          input: {
            name: form.name,
            provider: form.provider,
            credentials,
            baseUrl: form.baseUrl || null,
            fieldMappings,
            syncFrequencyMin: Number(form.syncFrequencyMin) || 360,
          },
        },
      }),
    });
    const { errors } = await res.json();
    if (errors && errors.length > 0) {
      setFormError(errors[0].message);
      return;
    }
    setShowCreateForm(false);
    setForm(DEFAULT_FORM);
    fetchConfigs();
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
          {t('settings.emi.title') || 'EMI Integrations'}
        </h1>
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="shimmer h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8 animate-enter">
      <PageHeader
        eyebrow={t('eyebrow.integrationEmi') || 'Integrations'}
        title={t('settings.emi.title') || 'EMI Integrations'}
        subtitle={
          t('settings.emi.subtitle') ||
          'Configure EMI data-pull credentials so the scoring engine has live transaction and balance data.'
        }
        actions={
          <button onClick={() => setShowCreateForm(true)} className="btn-primary">
            {t('settings.emi.addProvider') || 'Add EMI integration'}
          </button>
        }
      />

      {configs.length === 0 ? (
        <p className="text-sm text-gray-500">
          {t('settings.emi.noProviders') ||
            'No EMI integrations configured. Scoring will use neutral fallback values.'}
        </p>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => (
            <div
              key={config.id}
              className={`rounded-lg border p-4 ${
                config.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{config.name}</h3>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        config.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {config.isActive ? t('common.active') || 'Active' : t('common.inactive') || 'Inactive'}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        config.credentialsSet
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {config.credentialsSet
                        ? t('settings.emi.credsSet') || 'Credentials set'
                        : t('settings.emi.credsMissing') || 'No credentials'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {config.provider}
                    {config.baseUrl ? ` · ${config.baseUrl}` : ''} · sync every{' '}
                    {config.syncFrequencyMin} min
                  </p>
                  {config.lastSyncAt && (
                    <p className="mt-1 text-xs text-gray-400">
                      {t('settings.emi.lastSync') || 'Last sync'}:{' '}
                      {new Date(config.lastSyncAt).toLocaleString()}
                      {config.lastSyncError && (
                        <span className="ml-2 text-red-600">
                          ({config.lastSyncError})
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestConnection(config.id)}
                    disabled={testingId === config.id}
                    className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testingId === config.id
                      ? t('settings.emi.testing') || 'Testing...'
                      : t('settings.emi.testConnection') || 'Test connection'}
                  </button>
                  {config.isActive && (
                    <button
                      onClick={() => handleDeactivate(config.id)}
                      className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      {t('settings.emi.deactivate') || 'Deactivate'}
                    </button>
                  )}
                </div>
              </div>

              {testResult && testingId === null && (
                <div
                  className={`mt-3 rounded p-2 text-xs ${
                    testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}
                >
                  {testResult.success
                    ? `Connected (${testResult.latencyMs} ms)`
                    : `Connection failed: ${testResult.errorMessage ?? 'Unknown error'}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create form modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6">
            <h3 className="mb-4 text-[18px] font-semibold text-[color:var(--text-primary)]">
              {t('settings.emi.addProviderTitle') || 'Add EMI integration'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('settings.emi.name') || 'Display name'}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="MTN MoMo Ghana"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('settings.emi.provider') || 'Provider'}
                </label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('settings.emi.baseUrl') || 'Base URL'}
                </label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="https://sandbox.momodeveloper.mtn.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('settings.emi.credentials') || 'Credentials (JSON)'}
                </label>
                <textarea
                  value={form.credentialsJson}
                  onChange={(e) => setForm({ ...form, credentialsJson: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
                  rows={4}
                  placeholder='{"apiKey": "...", "apiSecret": "..."}'
                />
                <p className="mt-1 text-xs text-gray-500">
                  Encrypted at rest with AES-256-GCM. Plaintext never leaves
                  the server after creation.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('settings.emi.fieldMappings') || 'Field mappings (JSON)'}
                </label>
                <textarea
                  value={form.fieldMappingsJson}
                  onChange={(e) => setForm({ ...form, fieldMappingsJson: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
                  rows={3}
                  placeholder='{"emi_balance_field": "currentBalance"}'
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t('settings.emi.syncFrequencyMin') || 'Sync frequency (minutes)'}
                </label>
                <input
                  type="number"
                  min={5}
                  value={form.syncFrequencyMin}
                  onChange={(e) => setForm({ ...form, syncFrequencyMin: Number(e.target.value) })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              {formError && (
                <div className="rounded bg-red-50 p-2 text-xs text-red-700">{formError}</div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateForm(false); setFormError(null); setForm(DEFAULT_FORM); }}
                className="rounded border border-gray-300 px-4 py-2 text-sm"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name || !form.provider}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {t('common.create') || 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
