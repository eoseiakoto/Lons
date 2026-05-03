'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  value,
  onSearch,
  placeholder = 'Search...',
  debounceMs = 300,
  className = 'w-72',
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) onSearch(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onSearch, value]);

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)] pointer-events-none" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="input-field text-sm pl-9 pr-8 py-2"
      />
      {localValue && (
        <button
          onClick={() => { setLocalValue(''); onSearch(''); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors p-0.5 rounded"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
