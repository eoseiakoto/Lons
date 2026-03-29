'use client';

import { useState, useEffect } from 'react';

interface AllWalletConfig {
  id: string;
  tenantId: string;
  providerType: string;
  environmentMode: string;
  displayName: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

export default function PlatformIntegrationsPage() {
  const [configs, setConfigs] = useState<AllWalletConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query {
              allWalletProviderConfigs {
                id tenantId providerType environmentMode displayName
                isActive isDefault createdAt
              }
            }`,
          }),
        });
        const { data } = await res.json();
        setConfigs(data?.allWalletProviderConfigs ?? []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold">Platform Integration Overview</h1>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Platform Integration Overview</h1>
      <p className="mb-4 text-sm text-gray-500">
        All wallet provider configurations across service providers.
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Display Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Provider</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Environment</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Default</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {configs.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {c.tenantId.slice(0, 8)}...
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {c.displayName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {c.providerType}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {c.environmentMode}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      c.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {c.isDefault ? 'Yes' : 'No'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {configs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No integration configurations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
