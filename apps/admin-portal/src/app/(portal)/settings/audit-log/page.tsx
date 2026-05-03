'use client';

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Filter } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n/i18n-context';
import { FilterPill } from '@/components/ui/filter-pill';

const AUDIT_LOGS_QUERY = gql`
  query AuditLogs($filter: AuditLogFilterInput, $take: Int, $cursor: String) {
    auditLogs(filter: $filter, take: $take, cursor: $cursor) {
      items {
        id
        actorId
        actorType
        actorIp
        action
        resourceType
        resourceId
        beforeValue
        afterValue
        correlationId
        entryHash
        accessType
        createdAt
      }
      hasMore
    }
  }
`;

const USERS_QUERY = gql`
  query UsersForAuditFilter {
    users(pagination: { first: 100 }) {
      edges { node { id email name } }
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

interface AuditEntry {
  id: string;
  actorId?: string;
  actorType: string;
  actorIp?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeValue?: any;
  afterValue?: any;
  correlationId?: string;
  entryHash?: string;
  accessType?: string;
  createdAt: string;
}

interface UserNode {
  id: string;
  email: string;
  name?: string;
}

export default function AuditLogPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const filter: any = {};
  if (actionFilter) filter.action = actionFilter;
  if (resourceFilter) filter.resourceType = resourceFilter;
  if (actorFilter) filter.actorId = actorFilter;

  const { data, loading } = useQuery(AUDIT_LOGS_QUERY, {
    variables: {
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      take: 50,
      cursor,
    },
  });

  const { data: usersData } = useQuery(USERS_QUERY);

  const entries: AuditEntry[] = data?.auditLogs?.items || [];
  const hasMore = data?.auditLogs?.hasMore || false;
  const users: UserNode[] = usersData?.users?.edges?.map((e: any) => e.node) || [];

  const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));

  const formatLabel = (s: string) => s.replace(/_/g, ' ');

  const resetFilters = () => {
    setActionFilter('');
    setResourceFilter('');
    setActorFilter('');
    setCursor(undefined);
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <button
        onClick={() => router.push('/settings')}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      <PageHeader
        eyebrow={t('eyebrow.complianceAudit')}
        title={t('settings.auditLog.title')}
        subtitle={t('settings.auditLog.subtitle')}
      />

      <div className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">{t('common.filter')}</span>
        </div>
        <FilterPill
          options={[{ value: '', label: t('settings.auditLog.allActions') }, ...ACTION_OPTIONS.map((a) => ({ value: a, label: formatLabel(a) }))]}
          value={actionFilter}
          onChange={(v) => { setActionFilter(v); setCursor(undefined); }}
        />
        <FilterPill
          options={[{ value: '', label: t('settings.auditLog.allResources') }, ...RESOURCE_OPTIONS.map((r) => ({ value: r, label: formatLabel(r) }))]}
          value={resourceFilter}
          onChange={(v) => { setResourceFilter(v); setCursor(undefined); }}
        />
        <FilterPill
          options={[{ value: '', label: t('settings.auditLog.allUsers') }, ...users.map((u) => ({ value: u.id, label: u.name || u.email }))]}
          value={actorFilter}
          onChange={(v) => { setActorFilter(v); setCursor(undefined); }}
        />
        {(actionFilter || resourceFilter || actorFilter) && (
          <button onClick={resetFilters} className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1">{t('settings.auditLog.clear')}</button>
        )}
      </div>

      {loading ? (
        <div className="relative z-10 card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="relative z-10 card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('settings.auditLog.empty')}</div>
      ) : (
        <>
          <div className="relative z-10 card-glow overflow-hidden">
            <DataTable
              columns={[
                {
                  header: t('settings.auditLog.col.timestamp'),
                  accessor: (r: AuditEntry) => new Date(r.createdAt).toLocaleString(),
                },
                {
                  header: t('settings.auditLog.col.action'),
                  accessor: (r: AuditEntry) => (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionColor(r.action)}`}>
                      {formatLabel(r.action)}
                    </span>
                  ),
                },
                {
                  header: t('settings.auditLog.col.resource'),
                  accessor: (r: AuditEntry) => (
                    <span className="capitalize">{formatLabel(r.resourceType)}</span>
                  ),
                },
                {
                  header: t('settings.auditLog.col.resourceId'),
                  accessor: (r: AuditEntry) => r.resourceId ? r.resourceId.slice(0, 8) + '...' : '-',
                },
                {
                  header: t('settings.auditLog.col.actor'),
                  accessor: (r: AuditEntry) =>
                    r.actorId ? (userMap.get(r.actorId) || r.actorId.slice(0, 8) + '...') : r.actorType,
                },
                {
                  header: t('settings.auditLog.col.ip'),
                  accessor: (r: AuditEntry) => r.actorIp || '-',
                },
              ]}
              data={entries}
              onRowClick={(r: AuditEntry) => setSelectedEntry(r)}
            />
          </div>

          {(hasMore || cursor) && (
            <div className="flex justify-between mt-4">
              {cursor ? (
                <button onClick={() => setCursor(undefined)} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">
                  &larr; {t('settings.auditLog.firstPage')}
                </button>
              ) : <span />}
              {hasMore && entries.length > 0 && (
                <button
                  onClick={() => setCursor(entries[entries.length - 1].id)}
                  className="text-sm text-[color:var(--accent-primary-deep)] hover:underline"
                >
                  {t('settings.auditLog.nextPage')} &rarr;
                </button>
              )}
            </div>
          )}
        </>
      )}

      <Drawer open={!!selectedEntry} onClose={() => setSelectedEntry(null)} title={t('settings.auditLog.detailsTitle')} width="w-[560px]">
        {selectedEntry && (
          <div className="space-y-4">
            <DetailRow label={t('settings.auditLog.col.timestamp')} value={new Date(selectedEntry.createdAt).toLocaleString()} />
            <DetailRow label={t('settings.auditLog.col.action')} value={formatLabel(selectedEntry.action)} />
            <DetailRow label={t('settings.auditLog.detail.resourceType')} value={formatLabel(selectedEntry.resourceType)} />
            <DetailRow label={t('settings.auditLog.col.resourceId')} value={selectedEntry.resourceId || '-'} mono />
            <DetailRow label={t('settings.auditLog.col.actor')} value={selectedEntry.actorId ? (userMap.get(selectedEntry.actorId) || selectedEntry.actorId) : '-'} />
            <DetailRow label={t('settings.auditLog.detail.actorType')} value={selectedEntry.actorType} />
            <DetailRow label={t('settings.auditLog.detail.ipAddress')} value={selectedEntry.actorIp || '-'} />
            <DetailRow label={t('settings.auditLog.detail.correlationId')} value={selectedEntry.correlationId || '-'} mono />
            <DetailRow label={t('settings.auditLog.detail.accessType')} value={selectedEntry.accessType ? formatLabel(selectedEntry.accessType) : '-'} />
            <DetailRow label={t('settings.auditLog.detail.entryHash')} value={selectedEntry.entryHash || '-'} mono />

            {selectedEntry.beforeValue && (
              <div>
                <h4 className="text-sm font-medium text-[color:var(--text-secondary)] mb-1">{t('settings.auditLog.detail.before')}</h4>
                <pre className="glass-input text-xs text-[color:var(--text-primary)] overflow-auto max-h-48 p-3 rounded-lg font-mono">
                  {JSON.stringify(selectedEntry.beforeValue, null, 2)}
                </pre>
              </div>
            )}

            {selectedEntry.afterValue && (
              <div>
                <h4 className="text-sm font-medium text-[color:var(--text-secondary)] mb-1">{t('settings.auditLog.detail.after')}</h4>
                <pre className="glass-input text-xs text-[color:var(--text-primary)] overflow-auto max-h-48 p-3 rounded-lg font-mono">
                  {JSON.stringify(selectedEntry.afterValue, null, 2)}
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
