'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import { ChevronUp, ChevronDown, Building2, ArrowUpRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  planTier: string;
  spCount: number;
  createdAt: string;
}

interface TenantListTableProps {
  tenants: TenantRow[];
  loading?: boolean;
}

type SortField = 'name' | 'status' | 'planTier' | 'spCount' | 'createdAt';
type SortDir = 'asc' | 'desc';

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--status-success)',
  suspended: 'var(--status-error)',
  provisioning: 'var(--status-warning)',
  decommissioned: 'var(--text-tertiary)',
};

export function TenantListTable({ tenants, loading }: TenantListTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = [...tenants].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const cmp =
      typeof aVal === 'number'
        ? aVal - (bVal as number)
        : String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-1" />
    );
  };

  const columns: { key: SortField; label: string }[] = [
    { key: 'name', label: t('common.name') },
    { key: 'status', label: t('common.status') },
    { key: 'planTier', label: t('platform.tenantList.column.plan') },
    { key: 'spCount', label: t('platform.tenantList.column.sps') },
    { key: 'createdAt', label: t('common.created') },
  ];

  if (loading) {
    return (
      <div className="p-12 text-center text-sm text-[color:var(--text-tertiary)]">
        {t('platform.tenantList.loading')}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="p-12 text-center">
        <Building2 className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
        <p className="text-sm text-[color:var(--text-secondary)]">{t('platform.tenantList.emptyMessage')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[color:var(--border-subtle)]">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] px-4 py-3 cursor-pointer hover:text-[color:var(--text-primary)] transition-colors"
              >
                {col.label}
                <SortIcon field={col.key} />
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((tenant, i) => {
            const statusColor = STATUS_COLOR[tenant.status] ?? 'var(--text-tertiary)';
            return (
              <tr
                key={tenant.id}
                onClick={() => router.push(`/platform/tenants/${tenant.id}`)}
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--accent-primary-soft)',
                        color: 'var(--accent-primary-deep)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {tenant.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-[color:var(--text-primary)] truncate">
                        {tenant.name}
                      </div>
                      <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] truncate">
                        {tenant.slug}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      backgroundColor: `${statusColor}1A`,
                      color: statusColor,
                      border: `1px solid ${statusColor}33`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
                    />
                    {tenant.status}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[color:var(--text-primary)] capitalize">
                    {tenant.planTier}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-[color:var(--text-secondary)] tabular-nums">
                  {tenant.spCount}
                </td>
                <td className="px-4 py-3.5 text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
                  {formatDate(tenant.createdAt)}
                </td>
                <td className="px-4 py-3.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
