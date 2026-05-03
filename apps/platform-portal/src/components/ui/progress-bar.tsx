'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  rightLabel?: string;
  size?: 'sm' | 'md';
  variant?: 'accent' | 'success' | 'warning' | 'error';
  className?: string;
}

const variantColor: Record<NonNullable<ProgressBarProps['variant']>, string> = {
  accent: 'var(--accent-primary)',
  success: 'var(--status-success)',
  warning: 'var(--status-warning)',
  error: 'var(--status-error)',
};

/**
 * Single-value progress bar with optional inline labels. Animates fill
 * width from 0 → target on mount. Used by the "tariff load" cards in the
 * dashboard rebuild.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  rightLabel,
  size = 'md',
  variant = 'accent',
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value / max));
  const color = variantColor[variant];
  const trackHeight = size === 'sm' ? 4 : 6;

  return (
    <div className={cn('w-full', className)}>
      {(label || rightLabel) && (
        <div className="flex items-baseline justify-between mb-1.5">
          {label && (
            <span className="text-[11px] text-[color:var(--text-tertiary)] uppercase tracking-wider">
              {label}
            </span>
          )}
          {rightLabel && (
            <span
              className="text-[13px] font-semibold tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {rightLabel}
            </span>
          )}
        </div>
      )}
      <div
        className="w-full rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? rightLabel ?? `${Math.round(pct * 100)} percent`}
        style={{
          height: trackHeight,
          backgroundColor: 'var(--bg-muted)',
        }}
      >
        <motion.div
          className="h-full rounded-full"
          aria-hidden
          style={{
            background: `linear-gradient(90deg, ${color}, var(--accent-primary-deep))`,
            boxShadow: `0 0 12px -2px ${color}66`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 1.0, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
        />
      </div>
    </div>
  );
}
