'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface FilterPillProps {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  /** Optional leading icon shown next to the current label. */
  icon?: React.ReactNode;
  /** Minimum dropdown width — defaults to 180px. */
  minWidth?: number;
  /** Accessible label for assistive tech (e.g. "Filter by status"). */
  label?: string;
}

/**
 * Compact, auto-width dropdown styled as a button-pill. Replaces native
 * `<select>` for filter rows so multiple filters sit inline in a single
 * row instead of stretching to fill width.
 */
export function FilterPill({
  options,
  value,
  onChange,
  icon,
  minWidth = 180,
  label,
}: FilterPillProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlight(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  const current = options.find((o) => o.value === value) ?? options[0];
  const isActive = value !== '';

  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) {
        onChange(opt.value);
        setOpen(false);
        buttonRef.current?.focus();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlight(options.length - 1);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleButtonKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label ?? `Filter — ${current?.label ?? 'select'}`}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--bg-page)]"
        style={{
          backgroundColor: isActive ? 'var(--accent-primary-soft)' : 'var(--bg-card)',
          border: `1px solid ${isActive ? 'var(--border-default)' : 'var(--border-subtle)'}`,
          color: isActive ? 'var(--accent-primary-deep)' : 'var(--text-secondary)',
        }}
      >
        {icon && <span className="text-[color:var(--text-tertiary)]" aria-hidden>{icon}</span>}
        <span>{current?.label ?? ''}</span>
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform"
          aria-hidden
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={listboxRef}
            role="listbox"
            tabIndex={-1}
            aria-label={label ?? 'Filter options'}
            onKeyDown={handleListKeyDown}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            className="absolute left-0 top-full mt-1.5 z-30 py-1 rounded-lg overflow-hidden max-h-[320px] overflow-y-auto focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-elevated)',
              minWidth,
            }}
            onAnimationComplete={() => listboxRef.current?.focus()}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                onMouseEnter={() => setHighlight(i)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-left transition-colors"
                style={{
                  backgroundColor: i === highlight ? 'var(--bg-hover)' : 'transparent',
                  color: o.value === value ? 'var(--accent-primary-deep)' : 'var(--text-primary)',
                }}
              >
                {o.label}
                {o.value === value && (
                  <Check className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" aria-hidden />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
