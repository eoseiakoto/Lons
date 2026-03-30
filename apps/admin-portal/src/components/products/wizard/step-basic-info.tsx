'use client';

interface StepBasicInfoProps {
  data: {
    code: string;
    name: string;
    description: string;
    type: string;
    currency: string;
  };
  onChange: (updates: Partial<StepBasicInfoProps['data']>) => void;
}

const PRODUCT_TYPES = [
  { value: 'OVERDRAFT', label: 'Overdraft' },
  { value: 'MICRO_LOAN', label: 'Micro Loan' },
  { value: 'BNPL', label: 'Buy Now Pay Later' },
  { value: 'INVOICE_FACTORING', label: 'Invoice Factoring' },
];

const CURRENCIES = ['GHS', 'KES', 'NGN', 'UGX', 'TZS', 'USD'];

const labelCls = 'block text-sm font-medium text-white/60 mb-1';

export function StepBasicInfo({ data, onChange }: StepBasicInfoProps) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white/80">Basic Information</h3>
      <p className="text-sm text-white/40">Set the core identity of the product.</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Product Code</label>
          <input
            className="w-full glass-input"
            value={data.code}
            onChange={(e) => onChange({ code: e.target.value })}
            placeholder="e.g. ML-GHS-001"
            required
          />
          <p className="text-xs text-white/30 mt-1">Unique identifier for this product</p>
        </div>
        <div>
          <label className={labelCls}>Product Name</label>
          <input
            className="w-full glass-input"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Quick Cash Micro Loan"
            required
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          className="w-full glass-input"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Describe the product purpose and target audience"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Product Type</label>
          <select
            className="w-full glass-input"
            value={data.type}
            onChange={(e) => onChange({ type: e.target.value })}
          >
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <select
            className="w-full glass-input"
            value={data.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
