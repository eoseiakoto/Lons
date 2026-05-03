'use client';

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { downloadCSV } from '@/lib/utils';

const PLATFORM_AUDIT_LOGS_QUERY = gql`
  query PlatformAuditLogs($filter: PlatformAuditLogFilterInput, $take: Int, $cursor: String) {
    platformAuditLogs(filter: $filter, take: $take, cursor: $cursor) {
      items {
        id
        tenantId
        tenantName
        actorId
        actorType
        actorIp
        action
        resourceType
        resourceId
        correlationId
        metadata
        entryHash
        accessType
        createdAt
      }
      hasMore
    }
  }
`;

const TENANTS_QUERY = gql`
  query TenantsForAuditFilter {
    tenants(pagination: { first: 100 }) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

const ACTION_OPTIONS = [
  'create', 'update', 'delete', 'read',
  'login', 'logout', 'login_failed',
  'role_assigned', 'api_key_created', 'api_key_rotated', 'api_key_revoked',
  'disbursement', 'repayment', 'settlement', 'write_off',
  'blacklist', 'config_change',
];

const RESOURCE_OPTIONS = [
  'customer', 'product', 'contract', 'loan_request', 'repayment',
  'tenant', 'user', 'role', 'api_key', 'lender', 'settlement', 'webhook',
];

interface PlatformAuditEntry {
  id: string;
  tenantId: string;
  tenantName: string;
  actorId?: string;
  actorType: string;
  actorIp?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  entryHash?: string;
  accessType?: string;
  createdAt: string;
}

interface TenantNode {
  id: string;
  name: string;
}

export default function PlatformAuditLogPage() {
  const router = useRouter();
  const [tenantFilter, setTenantFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<PlatformAuditEntry | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const filter: Record<string, unknown> = {};
  if (tenantFilter) filter.tenantId = tenantFilter;
  if (actionFilter) filter.action = actionFilter;
  if (resourceFilter) filter.resourceType = resourceFilter;
  if (dateFrom) filter.dateFrom = new Date(dateFrom).toISOString();
  if (dateTo) filter.dateTo = new Date(dateTo + 'T23:59:59').toISOString();

  const { data, loading } = useQuery(PLATFORM_AUDIT_LOGS_QUERY, {
    variables: {
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      take: 50,
      cursor,
    },
  });

  const { data: tenantsData } = useQuery(TENANTS_QUERY);

  const entries: PlatformAuditEntry[] = data?.platformAuditLogs?.items || [];
  const hasMore = data?.platformAuditLogs?.hasMore || false;
  const tenants: TenantNode[] = tenantsData?.tenants?.edges?.map((e: { node: TenantNode }) => e.node) || [];

  const formatLabel = (s: string) => s.replace(/_/g, ' ');

  const resetFilters = () => {
    setTenantFilter('');
    setActionFilter('');
    setResourceFilter('');
    setDateFrom('');
    setDateTo('');
    setCursor(undefined);
  };

  const hasActiveFilters = tenantFilter || actionFilter || resourceFilter || dateFrom || dateTo;

  return (
    <div className="space-y-8 animate-enter">
      <button onClick={() => router.push('/settings')} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">&larr; Back</button>
      <header>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Platform Audit Log</h1>
        <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">Track all user and system actions.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={tenantFilter}
          onChange={(e) => { setTenantFilter(e.target.value); setCursor(undefined); }}
          className="glass-input text-sm"
        >
          <option value="">All Tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setCursor(undefined); }}
          className="glass-input text-sm"
        >
          <option value="">All Actions</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>{formatLabel(a)}</option>
          ))}
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => { setResourceFilter(e.target.value); setCursor(undefined); }}
          className="glass-input text-sm"
        >
          <option value="">All Resources</option>
          {RESOURCE_OPTIONS.map((r) => (
            <option key={r} value={r}>{formatLabel(r)}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setCursor(undefined); }}
          placeholder="From"
          className="glass-input text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setCursor(undefined); }}
          placeholder="To"
          className="glass-input text-sm"
        />
        {hasActiveFilters && (
          <button onClick={resetFilters} className="text-sm text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]">Clear filters</button>
        )}
        {entries.length > 0 && (
          <button
            onClick={() => {
              const headers = ['Timestamp', 'SP Name', 'Tenant ID', 'Action', 'Resource Type', 'Resource ID', 'Actor ID', 'Actor Type', 'IP', 'Correlation ID', 'Access Type', 'Entry Hash'];
              const rows = entries.map((e) => [
                new Date(e.createdAt).toISOString(),
                e.tenantName,
                e.tenantId,
                e.action,
                e.resourceType,
                e.resourceId || '',
                e.actorId || '',
                e.actorType,
                e.actorIp || '',
                e.correlationId || '',
                e.accessType || '',
                e.entryHash || '',
              ]);
              downloadCSV(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
            }}
            className="glass-button-primary text-sm px-3 py-1.5"
          >
            Export CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-[color:var(--text-tertiary)]">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="card p-6 text-[color:var(--text-tertiary)] text-center">No audit log entries found.</div>
      ) : (
        <>
          <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <DataTable
              columns={[
                {
                  header: 'Timestamp',
                  accessor: (r: PlatformAuditEntry) => new Date(r.createdAt).toLocaleString(),
                },
                {
                  header: 'SP Name',
                  accessor: (r: PlatformAuditEntry) => (
                    <span className="text-[color:var(--text-primary)]">{r.tenantName}</span>
                  ),
                },
                {
                  header: 'Action',
                  accessor: (r: PlatformAuditEntry) => (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionColor(r.action)}`}>
                      {formatLabel(r.action)}
                    </span>
                  ),
                },
                {
                  header: 'Resource',
                  accessor: (r: PlatformAuditEntry) => (
                    <span className="capitalize">{formatLabel(r.resourceType)}</span>
                  ),
                },
                {
                  header: 'Resource ID',
                  accessor: (r: PlatformAuditEntry) => r.resourceId ? r.resourceId.slice(0, 8) + '...' : '-',
                },
                {
                  header: 'Actor',
                  accessor: (r: PlatformAuditEntry) =>
                    r.actorId ? r.actorId.slice(0, 8) + '...' : r.actorType,
                },
                {
                  header: 'IP',
                  accessor: (r: PlatformAuditEntry) => r.actorIp || '-',
                },
              ]}
              data={entries}
              onRowClick={(r: PlatformAuditEntry) => setSelectedEntry(r)}
            />
          </div>

          {(hasMore || cursor) && (
            <div className="flex justify-between mt-4">
              {cursor ? (
                <button onClick={() => setCursor(undefined)} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">
                  &larr; First page
                </button>
              ) : <span />}
              {hasMore && entries.length > 0 && (
                <button
                  onClick={() => setCursor(entries[entries.length - 1].id)}
                  className="text-sm text-[color:var(--accent-primary-deep)] hover:underline"
                >
                  Next page &rarr;
                </button>
              )}
            </div>
          )}
        </>
      )}

      <Drawer open={!!selectedEntry} onClose={() => setSelectedEntry(null)} title="Audit Entry Details" width="w-[560px]">
        {selectedEntry && (
          <div className="space-y-4">
            <DetailRow label="Timestamp" value={new Date(selectedEntry.createdAt).toLocaleString()} />
            <DetailRow label="Tenant" value={selectedEntry.tenantName} />
            <DetailRow label="Tenant ID" value={selectedEntry.tenantId} mono />
            <DetailRow label="Action" value={formatLabel(selectedEntry.action)} />
            <DetailRow label="Resource Type" value={formatLabel(selectedEntry.resourceType)} />
            <DetailRow label="Resource ID" value={selectedEntry.resourceId || '-'} mono />
            <DetailRow label="Actor ID" value={selectedEntry.actorId || '-'} mono />
            <DetailRow label="Actor Type" value={selectedEntry.actorType} />
            <DetailRow label="IP Address" value={selectedEntry.actorIp || '-'} />
            <DetailRow label="Correlation ID" value={selectedEntry.correlationId || '-'} mono />
            <DetailRow label="Access Type" value={selectedEntry.accessType ? formatLabel(selectedEntry.accessType) : '-'} />
            <DetailRow label="Entry Hash" value={selectedEntry.entryHash || '-'} mono />

            {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-[color:var(--text-secondary)] mb-1">Metadata</h4>
                <pre className="glass-input text-xs text-[color:var(--text-primary)] overflow-auto max-h-48 p-3 rounded-lg font-mono">
                  {JSON.stringify(selectedEntry.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-sm text-[color:var(--text-tertiary)]">{label}</span>
      <p className={`text-sm text-[color:var(--text-primary)] mt-0.5 ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</p>
    </div>
  );
}

function actionColor(action: string): string {
  switch (action) {
    case 'create': return 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border border-[color:var(--status-success)]';
    case 'update': return 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border border-[color:var(--accent-primary-soft)]';
    case 'delete': return 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border border-[color:var(--status-error)]';
    case 'login': return 'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border border-[color:var(--status-info)]';
    case 'login_failed': return 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border border-[color:var(--status-warning)]';
    case 'disbursement': return 'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border border-[color:var(--status-info)]';
    case 'repayment': return 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border border-[color:var(--status-success)]';
    case 'blacklist': return 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border border-[color:var(--status-error)]';
    default: return 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border border-[color:var(--border-default)]';
  }
}
