'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  legalName?: string;
  registrationNumber?: string;
  country: string;
  schemaName: string;
  planTier: string;
  status: string;
  settings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface TenantDetailTabsProps {
  tenant: TenantDetail;
  onSave: (updates: Partial<TenantDetail>) => void;
  onStatusChange: (newStatus: string, reason?: string) => void;
  saving?: boolean;
}

const TABS = ['General', 'Configuration', 'Billing', 'Integrations', 'Activity'] as const;
type Tab = (typeof TABS)[number];

const TAB_KEYS: Record<Tab, string> = {
  General: 'platform.tenant.tab.general',
  Configuration: 'platform.tenant.tab.configuration',
  Billing: 'platform.tenant.tab.billing',
  Integrations: 'platform.tenant.tab.integrations',
  Activity: 'platform.tenant.tab.activity',
};

export function TenantDetailTabs({ tenant, onSave, onStatusChange, saving }: TenantDetailTabsProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('General');
  const [editState, setEditState] = useState({
    name: tenant.name,
    legalName: tenant.legalName || '',
    registrationNumber: tenant.registrationNumber || '',
    country: tenant.country,
  });
  const [suspendReason, setSuspendReason] = useState('');

  const handleFieldChange = (field: string, value: string) => {
    setEditState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveGeneral = () => {
    onSave({
      name: editState.name,
      legalName: editState.legalName || undefined,
      registrationNumber: editState.registrationNumber || undefined,
      country: editState.country,
    });
  };

  const labelCls = 'block text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5';

  return (
    <div>
      {/* Tab bar — motion-pill */}
      <div
        className="inline-flex p-1 rounded-lg gap-1 mb-6"
        style={{
          backgroundColor: 'var(--bg-muted)',
          border: '1px solid var(--border-subtle)',
          padding: 4,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="relative px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors"
              style={{
                color: isActive ? 'var(--text-on-accent)' : 'var(--text-secondary)',
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="tenant-detail-tab"
                  className="absolute inset-0 rounded-md"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    boxShadow: '0 4px 12px -4px rgba(var(--accent-primary-rgb), 0.45)',
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{t(TAB_KEYS[tab])}</span>
            </button>
          );
        })}
      </div>

      {/* General tab */}
      {activeTab === 'General' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>{t('platform.tenant.label.tenantName')}</label>
              <input
                className="input-field"
                value={editState.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{t('platform.tenant.label.slug')}</label>
              <input className="input-field opacity-60 cursor-not-allowed" value={tenant.slug} disabled />
            </div>
            <div>
              <label className={labelCls}>{t('platform.tenant.label.legalName')}</label>
              <input
                className="input-field"
                value={editState.legalName}
                onChange={(e) => handleFieldChange('legalName', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{t('platform.tenant.label.registrationNumber')}</label>
              <input
                className="input-field"
                value={editState.registrationNumber}
                onChange={(e) => handleFieldChange('registrationNumber', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{t('platform.tenant.label.country')}</label>
              <input
                className="input-field"
                value={editState.country}
                onChange={(e) => handleFieldChange('country', e.target.value)}
                maxLength={3}
              />
            </div>
            <div>
              <label className={labelCls}>{t('platform.tenant.label.schemaName')}</label>
              <input className="input-field opacity-60 cursor-not-allowed" value={tenant.schemaName} disabled />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSaveGeneral} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? t('common.saving') : t('platform.tenant.saveChanges')}
            </button>
          </div>

          {/* Status management */}
          <div className="card-glow p-5 space-y-4">
            <h4 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              {t('platform.tenant.statusManagement')}
            </h4>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[color:var(--text-tertiary)] text-[12px] uppercase tracking-wider">
                {t('platform.tenant.currentStatus')}
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor:
                    tenant.status === 'active'
                      ? 'var(--status-success-soft)'
                      : tenant.status === 'suspended'
                        ? 'var(--status-error-soft)'
                        : 'var(--status-warning-soft)',
                  color:
                    tenant.status === 'active'
                      ? 'var(--status-success-text)'
                      : tenant.status === 'suspended'
                        ? 'var(--status-error-text)'
                        : 'var(--status-warning-text)',
                  border: `1px solid ${
                    tenant.status === 'active'
                      ? 'var(--status-success)'
                      : tenant.status === 'suspended'
                        ? 'var(--status-error)'
                        : 'var(--status-warning)'
                  }33`,
                }}
              >
                {tenant.status}
              </span>
            </div>

            {tenant.status === 'provisioning' && (
              <button onClick={() => onStatusChange('active')} className="btn-primary">
                {t('platform.tenant.action.activate')}
              </button>
            )}
            {tenant.status === 'active' && (
              <div className="space-y-3">
                <input
                  className="input-field"
                  placeholder={t('platform.tenant.placeholder.suspendReason')}
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                />
                <button
                  onClick={() => onStatusChange('suspended', suspendReason)}
                  disabled={!suspendReason}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--status-error-soft)',
                    color: 'var(--status-error-text)',
                    border: '1px solid var(--status-error)',
                  }}
                >
                  {t('platform.tenant.action.suspend')}
                </button>
              </div>
            )}
            {tenant.status === 'suspended' && (
              <button onClick={() => onStatusChange('active')} className="btn-primary">
                {t('platform.tenant.action.reactivate')}
              </button>
            )}
          </div>

          <div className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums space-y-0.5">
            <p>{t('platform.tenant.createdAt')}{formatDateTime(tenant.createdAt)}</p>
            <p>{t('platform.tenant.updatedAt')}{formatDateTime(tenant.updatedAt)}</p>
          </div>
        </div>
      )}

      {/* Configuration tab */}
      {activeTab === 'Configuration' && (
        <div className="space-y-4">
          <h4 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('platform.tenant.tenantConfiguration')}
          </h4>
          <div className="card-glow p-5">
            <p className={labelCls}>{t('platform.tenant.planTier')}</p>
            <p className="text-[color:var(--text-primary)] capitalize text-[14px]">{tenant.planTier}</p>
          </div>
          <div className="card-glow p-5">
            <p className={labelCls}>{t('platform.tenant.settingsJson')}</p>
            <pre
              className="text-[11px] font-mono overflow-auto max-h-64 rounded-lg p-4"
              style={{
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-muted)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {JSON.stringify(tenant.settings || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Billing tab */}
      {activeTab === 'Billing' && (
        <div className="space-y-4">
          <h4 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('platform.tenant.billingInformation')}
          </h4>
          <div className="card-glow p-12 text-center">
            <p className="text-[color:var(--text-secondary)] text-sm">{t('platform.tenant.billingComingSoon')}</p>
            <p className="text-[color:var(--text-tertiary)] text-[12px] mt-1.5">
              {t('platform.tenant.planPrefix')}<span className="capitalize text-[color:var(--text-primary)]">{tenant.planTier}</span>
            </p>
          </div>
        </div>
      )}

      {/* Integrations tab */}
      {activeTab === 'Integrations' && (
        <div className="space-y-4">
          <h4 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('platform.tenant.integrations')}
          </h4>
          <div className="card-glow p-12 text-center">
            <p className="text-[color:var(--text-secondary)] text-sm">
              {t('platform.tenant.integrationsManagedPlatform')}
            </p>
          </div>
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'Activity' && (
        <div className="space-y-4">
          <h4 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('platform.tenant.recentActivity')}
          </h4>
          <div className="card-glow p-12 text-center">
            <p className="text-[color:var(--text-secondary)] text-sm">{t('platform.tenant.activityComingSoon')}</p>
            <p className="text-[color:var(--text-tertiary)] text-[12px] mt-1.5">
              {t('platform.tenant.createdOn')}<span className="text-[color:var(--text-primary)] tabular-nums">{formatDate(tenant.createdAt)}</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
