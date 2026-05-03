'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { maskPII, formatDate } from '@/lib/utils';

interface TabProfileProps {
  customer: any;
}

export function TabProfile({ customer }: TabProfileProps) {
  const { t } = useI18n();
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
              className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
              title={isRevealed ? t('customers.profile.mask') : t('customers.profile.reveal')}
            >
              {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
        </span>
      ),
    };
  };

  const fields = [
    { label: t('customers.profile.externalId'), value: customer.externalId },
    { label: t('customers.profile.externalSource'), value: customer.externalSource },
    { label: t('customers.profile.gender'), value: customer.gender || '-' },
    renderPIIField(t('customers.profile.phone'), customer.phonePrimary, 'phone'),
    renderPIIField(t('customers.profile.email'), customer.email, 'email'),
    renderPIIField(t('customers.profile.nationalId'), customer.nationalId, 'nationalId'),
    { label: t('customers.profile.kycLevel'), value: customer.kycLevel?.replace(/_/g, ' ') || '-' },
    { label: t('customers.profile.country'), value: customer.country || '-' },
    { label: t('customers.profile.region'), value: customer.region || '-' },
    { label: t('customers.profile.city'), value: customer.city || '-' },
    { label: t('customers.profile.watchlist'), value: customer.watchlist ? t('common.yes') : t('common.no') },
    { label: t('common.created'), value: formatDate(customer.createdAt) },
    { label: t('common.updated'), value: formatDate(customer.updatedAt) },
  ];

  return (
    <div className="card p-6">
      <h3 className="section-label mb-4">{t('customers.profile.personalInformation')}</h3>
      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{label}</dt>
            <dd className="text-sm text-[color:var(--text-primary)] mt-1">{typeof value === 'string' ? value : value}</dd>
          </div>
        ))}
      </dl>
      {customer.blacklistReason && (
        <div className="mt-6 p-4 rounded-lg bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)]">
          <dt className="text-xs font-medium text-[color:var(--status-error-text)] uppercase">{t('customers.profile.blacklistReason')}</dt>
          <dd className="text-sm text-[color:var(--status-error-text)] mt-1">{customer.blacklistReason}</dd>
        </div>
      )}
    </div>
  );
}
