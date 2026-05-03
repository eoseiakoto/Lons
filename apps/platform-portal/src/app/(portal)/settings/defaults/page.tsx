'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { gql, useQuery, useMutation } from '@apollo/client';
import { ShieldCheck, Save, Loader2 } from 'lucide-react';

const PLATFORM_DEFAULTS_QUERY = gql`
  query PlatformDefaults {
    platformDefaults {
      maxCustomerExposure
      enableCrossProductCheck
      maxCustomerExposureMultiplier
    }
  }
`;

const UPDATE_PLATFORM_DEFAULTS = gql`
  mutation UpdatePlatformDefaults($input: PlatformDefaultsInput!) {
    updatePlatformDefaults(input: $input) {
      maxCustomerExposure
      enableCrossProductCheck
      maxCustomerExposureMultiplier
    }
  }
`;

export default function PlatformDefaultsPage() {
  const router = useRouter();
  const { data, loading } = useQuery(PLATFORM_DEFAULTS_QUERY);
  const [updateDefaults, { loading: saving }] = useMutation(UPDATE_PLATFORM_DEFAULTS);

  const [defaults, setDefaults] = useState({
    maxCustomerExposure: '500000.00',
    enableCrossProductCheck: true,
    maxCustomerExposureMultiplier: 5,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (data?.platformDefaults) {
      setDefaults(data.platformDefaults);
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await updateDefaults({
        variables: {
          input: {
            maxCustomerExposure: defaults.maxCustomerExposure,
            enableCrossProductCheck: defaults.enableCrossProductCheck,
            maxCustomerExposureMultiplier: defaults.maxCustomerExposureMultiplier,
          },
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error handled by Apollo
    }
  };

  return (
    <div className="max-w-2xl space-y-8 animate-enter">
      <button onClick={() => router.push('/settings')} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">
        &larr; Back to Settings
      </button>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Platform Defaults</h1>

      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-[color:var(--accent-primary-deep)]" />
              <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Default Tenant Settings</h2>
            </div>
            {saveSuccess && (
              <span className="text-xs text-[color:var(--status-success-text)]">Saved successfully</span>
            )}
          </div>
          <p className="text-sm text-[color:var(--text-secondary)] mb-4">Default values applied when creating new tenants. These can be overridden per-tenant.</p>

          {loading ? (
            <div className="flex items-center gap-2 text-[color:var(--text-secondary)] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading defaults...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="section-label block mb-1">Max Customer Exposure</label>
                  <input
                    type="text"
                    value={defaults.maxCustomerExposure}
                    onChange={(e) => setDefaults(prev => ({ ...prev, maxCustomerExposure: e.target.value }))}
                    placeholder="500000.00"
                    className="glass-input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="section-label block mb-1">Income Multiplier</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={defaults.maxCustomerExposureMultiplier}
                    onChange={(e) => setDefaults(prev => ({ ...prev, maxCustomerExposureMultiplier: parseFloat(e.target.value) || 0 }))}
                    placeholder="0 to disable"
                    className="glass-input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="section-label block mb-1">Cross-Product Check</label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={defaults.enableCrossProductCheck}
                      onChange={(e) => setDefaults(prev => ({ ...prev, enableCrossProductCheck: e.target.checked }))}
                      className="w-4 h-4 rounded border-[color:var(--border-default)] bg-[color:var(--bg-muted)]"
                    />
                    <span className={`text-sm ${defaults.enableCrossProductCheck ? 'text-[color:var(--status-success-text)]' : 'text-[color:var(--text-tertiary)]'}`}>
                      {defaults.enableCrossProductCheck ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="glass-button-primary text-sm mt-4 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Defaults'}
              </button>
            </>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-5 h-5 text-[color:var(--accent-primary-deep)]" />
            <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Data Retention Policy</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[color:var(--text-secondary)]">Minimum Retention Period</span>
              <span className="text-sm text-[color:var(--text-primary)] font-medium">7 years</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[color:var(--text-secondary)]">Applies To</span>
              <span className="text-sm text-[color:var(--text-primary)] font-medium">All customer financial data</span>
            </div>
            <p className="text-xs text-[color:var(--text-tertiary)]">
              Customer data must be retained for a minimum of 7 years after the last transaction, per financial regulatory requirements. Anonymization requests for customers within the retention period will be blocked.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
