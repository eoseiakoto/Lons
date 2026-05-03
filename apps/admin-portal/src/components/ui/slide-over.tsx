'use client';

import { useEffect, useId, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface SlideOverProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}

/**
 * Right-anchored slide-over panel with iOS-curve drawer easing. Use for
 * detail views, compose forms, and any non-blocking secondary UI that
 * benefits from preserving page context.
 */
export function SlideOver({
  title,
  subtitle,
  onClose,
  footer,
  width = 560,
  children,
}: SlideOverProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    // Focus first focusable element inside the panel on mount.
    const id = window.setTimeout(() => {
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? node).focus();
    }, 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(id);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-y-0 right-0 max-w-full z-50 flex flex-col focus:outline-none"
        style={{
          width,
          backgroundColor: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-24px 0 48px -12px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="flex items-start justify-between px-6 py-5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <h2
              id={titleId}
              className="text-[20px] font-semibold tracking-tight text-[color:var(--text-primary)]"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-[12px] text-[color:var(--text-tertiary)] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] p-1 rounded-md hover:bg-[color:var(--bg-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary-ring)]"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div
            className="flex items-center gap-2 px-6 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            {footer}
          </div>
        )}
      </motion.div>
    </>
  );
}
