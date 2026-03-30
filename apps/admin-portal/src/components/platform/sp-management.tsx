'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Plus, Edit2, X, Check } from 'lucide-react';

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

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
    inactive: 'bg-white/10 text-white/40 border-white/10',
  };
  return map[status] || 'bg-white/10 text-white/60 border-white/10';
};

export function SpManagement({
  tenantId,
  serviceProviders,
  onCreateSp,
  onUpdateSp,
  loading,
}: SpManagementProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');

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
        <h4 className="text-sm font-semibold text-white/70">Service Providers</h4>
        <button
          onClick={() => {
            setShowCreate(true);
            setEditingId(null);
            setFormName('');
            setFormCode('');
          }}
          className="glass-button flex items-center gap-2 text-xs"
        >
          <Plus className="w-3 h-3" />
          Add SP
        </button>
      </div>

      {loading && (
        <div className="glass p-4 text-center">
          <p className="text-white/40 text-sm">Loading service providers...</p>
        </div>
      )}

      {/* Create inline form */}
      {showCreate && (
        <div className="glass p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="glass-input text-sm"
              placeholder="SP Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <input
              className="glass-input text-sm"
              placeholder="SP Code"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} className="glass-button-primary text-xs flex items-center gap-1">
              <Check className="w-3 h-3" /> Create
            </button>
            <button onClick={cancelEdit} className="glass-button text-xs flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* SP list */}
      {serviceProviders.length === 0 && !loading && !showCreate && (
        <div className="glass p-6 text-center">
          <p className="text-white/40 text-sm">No service providers yet.</p>
        </div>
      )}

      {serviceProviders.map((sp) => (
        <div key={sp.id} className="glass p-4">
          {editingId === sp.id ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="glass-input text-sm"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
                <input
                  className="glass-input text-sm"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleUpdate} className="glass-button-primary text-xs flex items-center gap-1">
                  <Check className="w-3 h-3" /> Save
                </button>
                <button onClick={cancelEdit} className="glass-button text-xs flex items-center gap-1">
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">{sp.name}</div>
                <div className="text-xs text-white/30">
                  Code: {sp.code} | Products: {sp.productCount}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border capitalize',
                    statusBadge(sp.status),
                  )}
                >
                  {sp.status}
                </span>
                <button
                  onClick={() => startEdit(sp)}
                  className="text-white/30 hover:text-white transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
