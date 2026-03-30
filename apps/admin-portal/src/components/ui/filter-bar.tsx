'use client';

import { SearchInput } from './search-input';
import { DateRangePicker } from './date-range-picker';
import { RotateCcw } from 'lucide-react';

export interface FilterDef {
  key: string;
  label: string;
  type: 'select' | 'search' | 'date-range';
  options?: { value: string; label: string }[];
  value: any;
  onChange: (value: any) => void;
}

interface FilterBarProps {
  filters: FilterDef[];
  onReset?: () => void;
}

export function FilterBar({ filters, onReset }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {filters.map((filter) => {
        if (filter.type === 'search') {
          return (
            <SearchInput
              key={filter.key}
              value={filter.value}
              onSearch={filter.onChange}
              placeholder={filter.label}
            />
          );
        }
        if (filter.type === 'date-range') {
          return (
            <DateRangePicker
              key={filter.key}
              value={filter.value}
              onChange={filter.onChange}
              label={filter.label}
            />
          );
        }
        if (filter.type === 'select') {
          return (
            <select
              key={filter.key}
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              className="glass-input text-sm py-1.5 px-2.5"
            >
              <option value="">{filter.label}</option>
              {filter.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          );
        }
        return null;
      })}
      {onReset && (
        <button onClick={onReset} className="text-white/40 hover:text-white transition-colors p-1.5" title="Reset filters">
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
