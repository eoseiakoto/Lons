'use client';

interface DateRangePickerProps {
  value: { from: string; to: string };
  onChange: (value: { from: string; to: string }) => void;
  label?: string;
}

export function DateRangePicker({ value, onChange, label }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-white/40 whitespace-nowrap">{label}</span>}
      <input
        type="date"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="glass-input text-sm py-1.5 px-2.5 w-36"
      />
      <span className="text-white/30 text-xs">to</span>
      <input
        type="date"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="glass-input text-sm py-1.5 px-2.5 w-36"
      />
    </div>
  );
}
