'use client';

interface FeeConfig {
  type: 'FLAT' | 'PERCENTAGE';
  amount: string;
}

interface StepFeesProps {
  data: {
    originationFee: FeeConfig;
    serviceFee: FeeConfig;
    latePenalty: FeeConfig;
    insurance: FeeConfig;
  };
  currency: string;
  onChange: (updates: Partial<StepFeesProps['data']>) => void;
}

const labelCls = 'block text-sm font-medium text-white/60 mb-1';

function FeeRow({
  label,
  description,
  fee,
  currency,
  onTypeChange,
  onAmountChange,
}: {
  label: string;
  description: string;
  fee: FeeConfig;
  currency: string;
  onTypeChange: (type: 'FLAT' | 'PERCENTAGE') => void;
  onAmountChange: (amount: string) => void;
}) {
  return (
    <div className="glass p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-white">{label}</h4>
          <p className="text-xs text-white/30 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Fee Type</label>
          <select
            className="w-full glass-input"
            value={fee.type}
            onChange={(e) => onTypeChange(e.target.value as 'FLAT' | 'PERCENTAGE')}
          >
            <option value="FLAT">Flat Amount ({currency})</option>
            <option value="PERCENTAGE">Percentage (%)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>
            {fee.type === 'FLAT' ? `Amount (${currency})` : 'Percentage (%)'}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="w-full glass-input"
            value={fee.amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder={fee.type === 'FLAT' ? 'e.g. 10.00' : 'e.g. 2.5'}
          />
        </div>
      </div>
    </div>
  );
}

export function StepFees({ data, currency, onChange }: StepFeesProps) {
  const updateFee = (
    key: keyof StepFeesProps['data'],
    field: 'type' | 'amount',
    value: string,
  ) => {
    onChange({
      [key]: {
        ...data[key],
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white/80">Fees & Charges</h3>
      <p className="text-sm text-white/40">Configure the fee structure for this product. Leave amount empty or 0 to disable a fee.</p>

      <div className="space-y-4">
        <FeeRow
          label="Origination Fee"
          description="One-time fee charged at loan disbursement"
          fee={data.originationFee}
          currency={currency}
          onTypeChange={(type) => updateFee('originationFee', 'type', type)}
          onAmountChange={(amount) => updateFee('originationFee', 'amount', amount)}
        />

        <FeeRow
          label="Service Fee"
          description="Recurring service/maintenance fee"
          fee={data.serviceFee}
          currency={currency}
          onTypeChange={(type) => updateFee('serviceFee', 'type', type)}
          onAmountChange={(amount) => updateFee('serviceFee', 'amount', amount)}
        />

        <FeeRow
          label="Late Payment Penalty"
          description="Fee applied when a repayment is overdue"
          fee={data.latePenalty}
          currency={currency}
          onTypeChange={(type) => updateFee('latePenalty', 'type', type)}
          onAmountChange={(amount) => updateFee('latePenalty', 'amount', amount)}
        />

        <FeeRow
          label="Insurance / Credit Life"
          description="Insurance premium charged on the loan"
          fee={data.insurance}
          currency={currency}
          onTypeChange={(type) => updateFee('insurance', 'type', type)}
          onAmountChange={(amount) => updateFee('insurance', 'amount', amount)}
        />
      </div>
    </div>
  );
}
