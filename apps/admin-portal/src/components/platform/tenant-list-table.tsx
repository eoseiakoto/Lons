'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { ChevronUp, ChevronDown } from 'lucide-react';

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

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
    provisioning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    decommissioned: 'bg-white/10 text-white/40 border-white/10',
  };
  return map[status] || 'bg-white/10 text-white/60 border-white/10';
};

export function TenantListTable({ tenants, loading }: TenantListTableProps) {
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
    const cmp = typeof aVal === 'number' ? aVal - (bVal as number) : String(aVal).localeCompare(String(bVal));
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
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status' },
    { key: 'planTier', label: 'Plan' },
    { key: 'spCount', label: 'SPs' },
    { key: 'createdAt', label: 'Created' },
  ];

  if (loading) {
    return (
      <div className="glass p-8 text-center">
        <div className="text-white/40 text-sm">Loading tenants...</div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="glass p-8 text-center">
        <p className="text-white/40 text-sm">No tenants found.</p>
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="text-left text-xs font-medium text-white/50 uppercase tracking-wider px-5 py-3 cursor-pointer hover:text-white/80 transition-colors"
              >
                {col.label}
                <SortIcon field={col.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((tenant) => (
            <tr
              key={tenant.id}
              onClick={() => router.push(`/platform/tenants/${tenant.id}`)}
              className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <td className="px-5 py-3">
                <div className="text-sm font-medium text-white">{tenant.name}</div>
                <div className="text-xs text-white/30">{tenant.slug}</div>
              </td>
              <td className="px-5 py-3">
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border capitalize',
                    statusBadge(tenant.status),
                  )}
                >
                  {tenant.status}
                </span>
              </td>
              <td className="px-5 py-3 text-sm text-white/70 capitalize">{tenant.planTier}</td>
              <td className="px-5 py-3 text-sm text-white/70">{tenant.spCount}</td>
              <td className="px-5 py-3 text-sm text-white/50">{formatDate(tenant.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
