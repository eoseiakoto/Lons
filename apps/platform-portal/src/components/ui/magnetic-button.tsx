'use client';

import * as React from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'destructive';

interface MagneticButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
  > {
  variant?: Variant;
  loading?: boolean;
  loadingLabel?: string;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  children?: React.ReactNode;
  pull?: number;
}

/**
 * Primary CTA with magnetic cursor pull, tactile press, and optional shimmer
 * during loading. For secondary surfaces fall back to the global `.btn-*`
 * classes — this component is for the buttons that need to feel premium.
 */
export const MagneticButton = React.forwardRef<HTMLButtonElement, MagneticButtonProps>(
  function MagneticButton(
    {
      variant = 'primary',
      loading = false,
      loadingLabel,
      icon,
      trailingIcon,
      children,
      pull = 4,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const x = useSpring(useTransform(mx, [-60, 60], [-pull, pull]), {
      stiffness: 300,
      damping: 28,
    });
    const y = useSpring(useTransform(my, [-30, 30], [-pull / 2, pull / 2]), {
      stiffness: 300,
      damping: 28,
    });

    const isDisabled = disabled || loading;

    const variantClasses: Record<Variant, string> = {
      primary:
        'bg-[color:var(--accent-primary)] hover:bg-[color:var(--accent-primary-hover)] text-[color:var(--text-on-accent)]',
      secondary:
        'bg-[color:var(--bg-card)] hover:bg-[color:var(--bg-hover)] text-[color:var(--text-primary)] border border-[color:var(--border-default)] hover:border-[color:var(--border-strong)]',
      destructive:
        'bg-[color:var(--status-error-soft)] hover:opacity-80 text-[color:var(--status-error-text)] border border-[color:var(--status-error)]',
    };

    return (
      <motion.button
        ref={ref}
        type={rest.type ?? 'button'}
        disabled={isDisabled}
        onMouseMove={(e) => {
          if (isDisabled || pull === 0) return;
          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          mx.set(e.clientX - (r.left + r.width / 2));
          my.set(e.clientY - (r.top + r.height / 2));
        }}
        onMouseLeave={() => {
          mx.set(0);
          my.set(0);
        }}
        whileTap={isDisabled ? undefined : { scale: 0.97, y: 1 }}
        style={{ x, y }}
        className={cn(
          'relative group inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--radius-md)] text-sm font-semibold tracking-tight overflow-hidden',
          'shadow-[0_1px_2px_rgba(120,70,30,0.10),inset_0_1px_0_rgba(255,255,255,0.18)]',
          'hover:shadow-[0_6px_18px_-6px_rgba(255,107,53,0.45),0_2px_6px_rgba(120,70,30,0.12),inset_0_1px_0_rgba(255,255,255,0.22)]',
          'transition-[background-color,box-shadow] duration-200 ease-out',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          variantClasses[variant],
          className,
        )}
        {...rest}
      >
        {loading && (
          <motion.span
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)',
            }}
            animate={{ x: ['-120%', '120%'] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'linear' }}
          />
        )}

        <span className="relative inline-flex items-center gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
          ) : (
            icon
          )}
          <span>{loading ? (loadingLabel ?? 'Loading…') : children}</span>
          {!loading && trailingIcon}
        </span>
      </motion.button>
    );
  },
);
