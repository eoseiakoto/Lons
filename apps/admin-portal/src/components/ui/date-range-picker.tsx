'use client';

interface DateRangePickerProps {
  value: { from: string; to: string };
  onChange: (value: { from: string; to: string }) => void;
  label?: string;
}

export function DateRangePicker({ value, onChange, label }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs font-medium text-[color:var(--text-secondary)] whitespace-nowrap">
          {label}
        </span>
      )}
      <input
        type="date"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="input-field text-sm py-2 px-3 w-36"
      />
      <span className="text-xs text-[color:var(--text-tertiary)]">to</span>
      <input
        type="date"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="input-field text-sm py-2 px-3 w-36"
      />
    </div>
  );
}
