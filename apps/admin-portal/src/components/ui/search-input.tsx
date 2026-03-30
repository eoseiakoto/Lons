'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchInput({ value, onSearch, placeholder = 'Search...', debounceMs = 300 }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) onSearch(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onSearch, value]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="glass-input text-sm pl-9 pr-8 py-1.5 w-64"
      />
      {localValue && (
        <button
          onClick={() => { setLocalValue(''); onSearch(''); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
