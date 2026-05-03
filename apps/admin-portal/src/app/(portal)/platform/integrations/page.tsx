'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n/i18n-context';

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
  const { t } = useI18n();
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
        <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Platform Integration Overview</h1>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer h-12 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8 animate-enter">
      <PageHeader
        eyebrow={t('eyebrow.platformIntegrations')}
        title="Platform integration overview"
        subtitle={`${configs.length} wallet config${configs.length === 1 ? '' : 's'} across SPs.`}
      />

      <div className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>Tenant</Th>
                <Th>Display name</Th>
                <Th>Provider</Th>
                <Th>Environment</Th>
                <Th>Status</Th>
                <Th>Default</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                >
                  <Td>
                    <span className="font-mono text-[12px] text-[color:var(--text-tertiary)]">
                      {c.tenantId.slice(0, 8)}…
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[color:var(--text-primary)] font-medium">
                      {c.displayName}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[color:var(--text-secondary)]">{c.providerType}</span>
                  </Td>
                  <Td>
                    <span className="text-[color:var(--text-secondary)] capitalize">{c.environmentMode}</span>
                  </Td>
                  <Td>
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        backgroundColor: c.isActive ? 'var(--status-success-soft)' : 'var(--status-error-soft)',
                        color: c.isActive ? 'var(--status-success-text)' : 'var(--status-error-text)',
                        border: `1px solid ${c.isActive ? 'var(--status-success)' : 'var(--status-error)'}33`,
                      }}
                    >
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[color:var(--text-secondary)]">{c.isDefault ? 'Yes' : 'No'}</span>
                  </Td>
                  <Td>
                    <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </Td>
                </tr>
              ))}
              {configs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[color:var(--text-tertiary)]">
                    No integration configurations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5 whitespace-nowrap">{children}</td>;
}
