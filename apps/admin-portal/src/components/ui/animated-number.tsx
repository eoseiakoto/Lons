'use client';

import { useEffect, useRef } from 'react';
import { animate, useMotionValue } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Counts up from 0 to `value` on mount, then re-runs whenever `value` changes.
 * Renders one DOM node and updates its textContent each frame so we don't
 * trigger a React re-render every tick. Falls back to the final string when
 * the user has prefers-reduced-motion enabled.
 */
export function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  duration = 1.6,
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    if (!ref.current) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      ref.current.textContent = format(value);
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (n) => {
        if (ref.current) ref.current.textContent = format(n);
      },
    });
    return () => controls.stop();
  }, [value, duration, format, mv]);

  // Initial SSR-friendly render uses the formatted target — count-up just
  // overrides on mount. Avoids a flash of "0" before hydration.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
