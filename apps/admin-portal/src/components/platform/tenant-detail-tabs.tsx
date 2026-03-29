'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/utils';

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

export function TenantDetailTabs({ tenant, onSave, onStatusChange, saving }: TenantDetailTabsProps) {
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

  const labelCls = 'block text-sm font-medium text-white/60 mb-1';

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-all border-b-2',
              activeTab === tab
                ? 'text-white border-blue-400'
                : 'text-white/40 border-transparent hover:text-white/70',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* General tab */}
      {activeTab === 'General' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Tenant Name</label>
              <input
                className="w-full glass-input"
                value={editState.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Slug</label>
              <input className="w-full glass-input opacity-60" value={tenant.slug} disabled />
            </div>
            <div>
              <label className={labelCls}>Legal Name</label>
              <input
                className="w-full glass-input"
                value={editState.legalName}
                onChange={(e) => handleFieldChange('legalName', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Registration Number</label>
              <input
                className="w-full glass-input"
                value={editState.registrationNumber}
                onChange={(e) => handleFieldChange('registrationNumber', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <input
                className="w-full glass-input"
                value={editState.country}
                onChange={(e) => handleFieldChange('country', e.target.value)}
                maxLength={3}
              />
            </div>
            <div>
              <label className={labelCls}>Schema Name</label>
              <input className="w-full glass-input opacity-60" value={tenant.schemaName} disabled />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveGeneral}
              disabled={saving}
              className="glass-button-primary text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Status management */}
          <div className="glass p-5 space-y-4">
            <h4 className="text-sm font-semibold text-white/70">Status Management</h4>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-white/50">Current Status:</span>
              <span className="text-white font-medium capitalize">{tenant.status}</span>
            </div>

            {tenant.status === 'provisioning' && (
              <button
                onClick={() => onStatusChange('active')}
                className="glass-button-primary text-sm"
              >
                Activate Tenant
              </button>
            )}
            {tenant.status === 'active' && (
              <div className="space-y-3">
                <input
                  className="w-full glass-input"
                  placeholder="Reason for suspension..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                />
                <button
                  onClick={() => onStatusChange('suspended', suspendReason)}
                  disabled={!suspendReason}
                  className="px-4 py-2 bg-red-500/80 border border-red-400/30 text-white rounded-lg text-sm hover:bg-red-500/90 transition-all disabled:opacity-50"
                >
                  Suspend Tenant
                </button>
              </div>
            )}
            {tenant.status === 'suspended' && (
              <button
                onClick={() => onStatusChange('active')}
                className="glass-button-primary text-sm"
              >
                Reactivate Tenant
              </button>
            )}
          </div>

          <div className="text-xs text-white/30 space-y-1">
            <p>Created: {formatDateTime(tenant.createdAt)}</p>
            <p>Last Updated: {formatDateTime(tenant.updatedAt)}</p>
          </div>
        </div>
      )}

      {/* Configuration tab */}
      {activeTab === 'Configuration' && (
        <div className="space-y-5">
          <h4 className="text-sm font-semibold text-white/70">Tenant Configuration</h4>
          <div className="glass p-5">
            <label className={labelCls}>Plan Tier</label>
            <div className="text-white capitalize">{tenant.planTier}</div>
          </div>
          <div className="glass p-5">
            <label className={labelCls}>Settings (JSON)</label>
            <pre className="text-xs text-white/60 bg-white/5 rounded-lg p-4 overflow-auto max-h-64">
              {JSON.stringify(tenant.settings || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Billing tab */}
      {activeTab === 'Billing' && (
        <div className="space-y-5">
          <h4 className="text-sm font-semibold text-white/70">Billing Information</h4>
          <div className="glass p-8 text-center">
            <p className="text-white/40 text-sm">Billing integration coming soon.</p>
            <p className="text-white/30 text-xs mt-1">
              Plan: <span className="capitalize">{tenant.planTier}</span>
            </p>
          </div>
        </div>
      )}

      {/* Integrations tab */}
      {activeTab === 'Integrations' && (
        <div className="space-y-5">
          <h4 className="text-sm font-semibold text-white/70">Integrations</h4>
          <div className="glass p-8 text-center">
            <p className="text-white/40 text-sm">
              Integration configuration is managed at the platform level.
            </p>
          </div>
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'Activity' && (
        <div className="space-y-5">
          <h4 className="text-sm font-semibold text-white/70">Recent Activity</h4>
          <div className="glass p-8 text-center">
            <p className="text-white/40 text-sm">Activity log will appear here.</p>
            <p className="text-white/30 text-xs mt-1">
              Tenant created on {formatDate(tenant.createdAt)}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
