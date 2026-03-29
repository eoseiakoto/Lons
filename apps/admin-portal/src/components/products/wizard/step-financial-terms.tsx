'use client';

interface StepFinancialTermsProps {
  data: {
    minAmount: string;
    maxAmount: string;
    minTenorDays: string;
    maxTenorDays: string;
    interestRateModel: string;
    interestRate: string;
    repaymentMethod: string;
    gracePeriodDays: string;
  };
  currency: string;
  onChange: (updates: Partial<StepFinancialTermsProps['data']>) => void;
}

const INTEREST_MODELS = [
  { value: 'FLAT', label: 'Flat Rate' },
  { value: 'REDUCING_BALANCE', label: 'Reducing Balance' },
];

const REPAYMENT_METHODS = [
  { value: 'EQUAL_INSTALLMENT', label: 'Equal Installments' },
  { value: 'BULLET', label: 'Bullet (Lump Sum)' },
  { value: 'INTEREST_ONLY', label: 'Interest Only' },
];

const labelCls = 'block text-sm font-medium text-white/60 mb-1';

export function StepFinancialTerms({ data, currency, onChange }: StepFinancialTermsProps) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white/80">Financial Terms</h3>
      <p className="text-sm text-white/40">Define the financial parameters for this product.</p>

      <div className="glass p-4 space-y-4">
        <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">Loan Amount ({currency})</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Minimum Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full glass-input"
              value={data.minAmount}
              onChange={(e) => onChange({ minAmount: e.target.value })}
              placeholder="e.g. 50.00"
            />
          </div>
          <div>
            <label className={labelCls}>Maximum Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full glass-input"
              value={data.maxAmount}
              onChange={(e) => onChange({ maxAmount: e.target.value })}
              placeholder="e.g. 5000.00"
            />
          </div>
        </div>
      </div>

      <div className="glass p-4 space-y-4">
        <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">Tenor</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Minimum Tenor (days)</label>
            <input
              type="number"
              min="1"
              className="w-full glass-input"
              value={data.minTenorDays}
              onChange={(e) => onChange({ minTenorDays: e.target.value })}
              placeholder="e.g. 7"
            />
          </div>
          <div>
            <label className={labelCls}>Maximum Tenor (days)</label>
            <input
              type="number"
              min="1"
              className="w-full glass-input"
              value={data.maxTenorDays}
              onChange={(e) => onChange({ maxTenorDays: e.target.value })}
              placeholder="e.g. 90"
            />
          </div>
        </div>
      </div>

      <div className="glass p-4 space-y-4">
        <h4 className="text-sm font-medium text-white/60 uppercase tracking-wide">Interest & Repayment</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Interest Rate Model</label>
            <select
              className="w-full glass-input"
              value={data.interestRateModel}
              onChange={(e) => onChange({ interestRateModel: e.target.value })}
            >
              {INTEREST_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Interest Rate (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="w-full glass-input"
              value={data.interestRate}
              onChange={(e) => onChange({ interestRate: e.target.value })}
              placeholder="e.g. 5.5"
            />
          </div>
          <div>
            <label className={labelCls}>Repayment Method</label>
            <select
              className="w-full glass-input"
              value={data.repaymentMethod}
              onChange={(e) => onChange({ repaymentMethod: e.target.value })}
            >
              {REPAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="max-w-xs">
          <label className={labelCls}>Grace Period (days)</label>
          <input
            type="number"
            min="0"
            className="w-full glass-input"
            value={data.gracePeriodDays}
            onChange={(e) => onChange({ gracePeriodDays: e.target.value })}
            placeholder="0"
          />
          <p className="text-xs text-white/30 mt-1">Days after due date before penalties apply</p>
        </div>
      </div>
    </div>
  );
}
