'use client';

import { useState, useEffect, useCallback } from 'react';

interface WalletProviderConfig {
  id: string;
  providerType: string;
  environmentMode: string;
  displayName: string;
  apiBaseUrl?: string;
  configJson?: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionTestResult {
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
}

const PROVIDER_TYPES = ['MOCK', 'MTN_MOMO', 'MPESA', 'AIRTEL_MONEY', 'GENERIC'];
const ENVIRONMENT_MODES = ['SANDBOX', 'PRODUCTION'];

export default function IntegrationSettingsPage() {
  const [configs, setConfigs] = useState<WalletProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newConfig, setNewConfig] = useState({
    displayName: '',
    providerType: 'MOCK',
    environmentMode: 'SANDBOX',
    apiBaseUrl: '',
    configJson: '{}',
  });

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query {
            walletProviderConfigs {
              id providerType environmentMode displayName apiBaseUrl
              configJson isActive isDefault createdAt updatedAt
            }
          }`,
        }),
      });
      const { data } = await res.json();
      setConfigs(data?.walletProviderConfigs ?? []);
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
          query: `mutation TestWallet($id: ID!) {
            testWalletConnection(id: $id) { success latencyMs errorMessage }
          }`,
          variables: { id: configId },
        }),
      });
      const { data } = await res.json();
      setTestResult(data?.testWalletConnection);
    } catch {
      setTestResult({ success: false, latencyMs: 0, errorMessage: 'Request failed' });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (configId: string) => {
    await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Deactivate($id: ID!) {
          deactivateWalletProviderConfig(id: $id) { id isActive }
        }`,
        variables: { id: configId },
      }),
    });
    fetchConfigs();
  };

  const handleSetDefault = async (configId: string) => {
    await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation SetDefault($id: ID!) {
          setDefaultWalletProvider(id: $id) { id isDefault }
        }`,
        variables: { id: configId },
      }),
    });
    fetchConfigs();
  };

  const handleCreateConfig = async () => {
    let parsedJson: Record<string, unknown> = {};
    try {
      parsedJson = JSON.parse(newConfig.configJson);
    } catch {
      return;
    }

    await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Create($input: CreateWalletProviderConfigInput!) {
          createWalletProviderConfig(input: $input) { id }
        }`,
        variables: {
          input: {
            displayName: newConfig.displayName,
            providerType: newConfig.providerType,
            environmentMode: newConfig.environmentMode,
            apiBaseUrl: newConfig.apiBaseUrl || null,
            configJson: parsedJson,
          },
        },
      }),
    });
    setShowCreateForm(false);
    setNewConfig({ displayName: '', providerType: 'MOCK', environmentMode: 'SANDBOX', apiBaseUrl: '', configJson: '{}' });
    fetchConfigs();
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold">Integration Settings</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Integration Settings</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Provider
        </button>
      </div>

      {/* Wallet Providers */}
      <h2 className="mb-4 text-lg font-semibold">Wallet Providers</h2>

      {configs.length === 0 ? (
        <p className="text-sm text-gray-500">No wallet provider configurations found.</p>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => (
            <div
              key={config.id}
              className={`rounded-lg border p-4 ${
                config.isDefault ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{config.displayName}</h3>
                    {config.isDefault && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Default
                      </span>
                    )}
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        config.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {config.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {config.providerType} &middot; {config.environmentMode}
                    {config.apiBaseUrl && ` &middot; ${config.apiBaseUrl}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestConnection(config.id)}
                    disabled={testingId === config.id}
                    className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testingId === config.id ? 'Testing...' : 'Test Connection'}
                  </button>
                  {!config.isDefault && config.isActive && (
                    <button
                      onClick={() => handleSetDefault(config.id)}
                      className="rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Set Default
                    </button>
                  )}
                  {config.isActive && (
                    <button
                      onClick={() => handleToggleActive(config.id)}
                      className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Deactivate
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
                    ? `Connection successful (${testResult.latencyMs}ms)`
                    : `Connection failed: ${testResult.errorMessage}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">Add Wallet Provider</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Display Name</label>
                <input
                  type="text"
                  value={newConfig.displayName}
                  onChange={(e) => setNewConfig({ ...newConfig, displayName: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Provider Type</label>
                <select
                  value={newConfig.providerType}
                  onChange={(e) => setNewConfig({ ...newConfig, providerType: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Environment</label>
                <select
                  value={newConfig.environmentMode}
                  onChange={(e) => setNewConfig({ ...newConfig, environmentMode: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {ENVIRONMENT_MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">API Base URL (optional)</label>
                <input
                  type="text"
                  value={newConfig.apiBaseUrl}
                  onChange={(e) => setNewConfig({ ...newConfig, apiBaseUrl: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Config JSON</label>
                <textarea
                  value={newConfig.configJson}
                  onChange={(e) => setNewConfig({ ...newConfig, configJson: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
                  rows={4}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded border border-gray-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConfig}
                disabled={!newConfig.displayName}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
