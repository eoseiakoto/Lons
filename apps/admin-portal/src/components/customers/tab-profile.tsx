'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { maskPII, formatDate } from '@/lib/utils';

interface TabProfileProps {
  customer: any;
}

export function TabProfile({ customer }: TabProfileProps) {
  const { hasPermission } = useAuth();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const canViewPII = hasPermission('pii:view');

  const toggleReveal = (field: string) => {
    if (!canViewPII) return;
    setRevealed((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const renderPIIField = (label: string, value: string | null, type: 'phone' | 'nationalId' | 'email') => {
    if (!value) return { label, value: '-' };
    const isRevealed = revealed[type];
    const display = isRevealed ? value : maskPII(value, type);

    return {
      label,
      value: (
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm">{display}</span>
          {canViewPII && (
            <button
              onClick={() => toggleReveal(type)}
              className="text-white/30 hover:text-white/60 transition-colors"
              title={isRevealed ? 'Mask' : 'Reveal'}
            >
              {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
        </span>
      ),
    };
  };

  const fields = [
    { label: 'External ID', value: customer.externalId },
    { label: 'External Source', value: customer.externalSource },
    { label: 'Gender', value: customer.gender || '-' },
    renderPIIField('Phone', customer.phonePrimary, 'phone'),
    renderPIIField('Email', customer.email, 'email'),
    renderPIIField('National ID', customer.nationalId, 'nationalId'),
    { label: 'KYC Level', value: customer.kycLevel?.replace(/_/g, ' ') || '-' },
    { label: 'Country', value: customer.country || '-' },
    { label: 'Region', value: customer.region || '-' },
    { label: 'City', value: customer.city || '-' },
    { label: 'Watchlist', value: customer.watchlist ? 'Yes' : 'No' },
    { label: 'Created', value: formatDate(customer.createdAt) },
    { label: 'Updated', value: formatDate(customer.updatedAt) },
  ];

  return (
    <div className="glass p-6">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Personal Information</h3>
      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs font-medium text-white/40 uppercase">{label}</dt>
            <dd className="text-sm text-white mt-1">{typeof value === 'string' ? value : value}</dd>
          </div>
        ))}
      </dl>
      {customer.blacklistReason && (
        <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <dt className="text-xs font-medium text-red-400 uppercase">Blacklist Reason</dt>
          <dd className="text-sm text-red-400 mt-1">{customer.blacklistReason}</dd>
        </div>
      )}
    </div>
  );
}
