'use client';

import { useState } from 'react';
import { Plus, Edit2, X, Check, Building2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export interface ServiceProviderRow {
  id: string;
  name: string;
  code: string;
  status: string;
  productCount: number;
}

interface SpManagementProps {
  tenantId: string;
  serviceProviders: ServiceProviderRow[];
  onCreateSp: (data: { name: string; code: string }) => void;
  onUpdateSp: (id: string, data: { name: string; code: string }) => void;
  loading?: boolean;
}

export function SpManagement({
  tenantId: _tenantId,
  serviceProviders,
  onCreateSp,
  onUpdateSp,
  loading,
}: SpManagementProps) {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');

  const statusToken = (status: string): { color: string; label: string } => {
    const map: Record<string, { color: string; label: string }> = {
      active: { color: 'var(--status-success)', label: t('common.active') },
      suspended: { color: 'var(--status-error)', label: t('platform.sp.suspended') },
      inactive: { color: 'var(--text-tertiary)', label: t('common.inactive') },
    };
    return map[status] || { color: 'var(--text-tertiary)', label: status };
  };

  const handleCreate = () => {
    if (formName.trim() && formCode.trim()) {
      onCreateSp({ name: formName.trim(), code: formCode.trim() });
      setFormName('');
      setFormCode('');
      setShowCreate(false);
    }
  };

  const startEdit = (sp: ServiceProviderRow) => {
    setEditingId(sp.id);
    setFormName(sp.name);
    setFormCode(sp.code);
  };

  const handleUpdate = () => {
    if (editingId && formName.trim() && formCode.trim()) {
      onUpdateSp(editingId, { name: formName.trim(), code: formCode.trim() });
      setEditingId(null);
      setFormName('');
      setFormCode('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowCreate(false);
    setFormName('');
    setFormCode('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
          {t('platform.sp.title')}
        </h4>
        <button
          onClick={() => {
            setShowCreate(true);
            setEditingId(null);
            setFormName('');
            setFormCode('');
          }}
          className="btn-secondary text-[12px]"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('platform.sp.addSp')}
        </button>
      </div>

      {loading && (
        <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">
          {t('platform.sp.loading')}
        </div>
      )}

      {/* Create inline form */}
      {showCreate && (
        <div className="card-glow p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="input-field"
              placeholder={t('platform.sp.placeholder.name')}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <input
              className="input-field"
              placeholder={t('platform.sp.placeholder.code')}
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} className="btn-primary text-[12px]">
              <Check className="w-3.5 h-3.5" /> {t('common.create')}
            </button>
            <button onClick={cancelEdit} className="btn-ghost text-[12px]">
              <X className="w-3.5 h-3.5" /> {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {serviceProviders.length === 0 && !loading && !showCreate && (
        <div className="card-glow p-12 text-center">
          <Building2 className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
          <p className="text-sm text-[color:var(--text-secondary)]">{t('platform.sp.emptyMessage')}</p>
        </div>
      )}

      {/* SP list */}
      {serviceProviders.map((sp) => {
        const token = statusToken(sp.status);
        return (
          <div key={sp.id} className="card-glow p-4">
            {editingId === sp.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="input-field"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                  <input
                    className="input-field"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleUpdate} className="btn-primary text-[12px]">
                    <Check className="w-3.5 h-3.5" /> {t('common.save')}
                  </button>
                  <button onClick={cancelEdit} className="btn-ghost text-[12px]">
                    <X className="w-3.5 h-3.5" /> {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-primary-soft)',
                      color: 'var(--accent-primary-deep)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {sp.code.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-[color:var(--text-primary)] truncate">
                      {sp.name}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                      <span className="font-mono">{sp.code}</span> · {t('platform.sp.productCount', { count: sp.productCount })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      backgroundColor: `${token.color}1A`,
                      color: token.color,
                      border: `1px solid ${token.color}33`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: token.color, boxShadow: `0 0 6px ${token.color}` }}
                    />
                    {token.label}
                  </span>
                  <button
                    onClick={() => startEdit(sp)}
                    className="text-[color:var(--text-tertiary)] hover:text-[color:var(--accent-primary-deep)] transition-colors p-1.5 rounded-md hover:bg-[color:var(--bg-hover)]"
                    title={t('common.edit')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
