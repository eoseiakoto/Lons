'use client';

import { useState } from 'react';

interface StepEligibilityProps {
  data: {
    minCreditScore: string;
    minKycLevel: string;
    maxActiveLoans: string;
    customRules: string;
  };
  onChange: (updates: Partial<StepEligibilityProps['data']>) => void;
}

const KYC_LEVELS = [
  { value: '0', label: 'Level 0 - None' },
  { value: '1', label: 'Level 1 - Basic' },
  { value: '2', label: 'Level 2 - Standard' },
  { value: '3', label: 'Level 3 - Full' },
];

const labelCls = 'block text-sm font-medium text-white/60 mb-1';

export function StepEligibility({ data, onChange }: StepEligibilityProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleCustomRulesChange = (value: string) => {
    onChange({ customRules: value });
    if (value.trim() === '') {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON format');
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white/80">Eligibility Criteria</h3>
      <p className="text-sm text-white/40">Define the requirements a customer must meet to qualify for this product.</p>

      <div className="glass p-4 space-y-4">
        <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">Scoring & KYC</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Minimum Credit Score</label>
            <input
              type="number"
              min="0"
              max="1000"
              className="w-full glass-input"
              value={data.minCreditScore}
              onChange={(e) => onChange({ minCreditScore: e.target.value })}
              placeholder="e.g. 300"
            />
            <p className="text-xs text-white/30 mt-1">Score range: 0-1000</p>
          </div>
          <div>
            <label className={labelCls}>Minimum KYC Level</label>
            <select
              className="w-full glass-input"
              value={data.minKycLevel}
              onChange={(e) => onChange({ minKycLevel: e.target.value })}
            >
              {KYC_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Max Active Loans</label>
            <input
              type="number"
              min="1"
              max="50"
              className="w-full glass-input"
              value={data.maxActiveLoans}
              onChange={(e) => onChange({ maxActiveLoans: e.target.value })}
              placeholder="e.g. 1"
            />
            <p className="text-xs text-white/30 mt-1">Max concurrent active loans per customer</p>
          </div>
        </div>
      </div>

      <div className="glass p-4 space-y-3">
        <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">Custom Rules</h4>
        <p className="text-xs text-white/30">
          Optional JSON array of custom eligibility rules. Each rule should have &quot;field&quot;, &quot;operator&quot;, and &quot;value&quot; keys.
        </p>
        <textarea
          className="w-full glass-input font-mono text-sm"
          value={data.customRules}
          onChange={(e) => handleCustomRulesChange(e.target.value)}
          rows={6}
          placeholder={`[\n  { "field": "monthly_income", "operator": ">=", "value": 500 },\n  { "field": "account_age_days", "operator": ">=", "value": 90 }\n]`}
        />
        {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
      </div>
    </div>
  );
}
