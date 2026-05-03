'use client';

// SYNCED FILE — kept byte-identical across admin-portal and platform-portal.
// Edit one, sync to the other. Run `pnpm verify:synced` to assert parity.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Ambient mission-control backdrop — three slowly drifting emerald/cyan orbs
 * and a faint mask-faded grid covering the full viewport. Pure decoration,
 * pointer-events disabled.
 *
 * Singleton: multiple mounted instances share a global counter so only the
 * first one renders. This lets us render once at the portal layout level
 * for true edge-to-edge coverage (under sidebar/header) without doubling
 * up when a page also includes a `<PageBackdrop />`.
 */

let mountCount = 0;
const subscribers = new Set<(claimed: boolean) => void>();

function notify(claimed: boolean) {
  subscribers.forEach((s) => s(claimed));
}

export function PageBackdrop() {
  const [shouldRender, setShouldRender] = useState(() => mountCount === 0);

  useEffect(() => {
    mountCount += 1;
    const wasFirst = mountCount === 1;
    if (!wasFirst) {
      setShouldRender(false);
    } else {
      setShouldRender(true);
    }

    const onChange = (claimed: boolean) => {
      // If our slot becomes available (no other instance owns it), take it.
      if (!claimed && mountCount === 1) setShouldRender(true);
    };
    subscribers.add(onChange);

    return () => {
      mountCount -= 1;
      subscribers.delete(onChange);
      notify(mountCount > 0);
    };
  }, []);

  if (!shouldRender) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden -z-10"
    >
      {/* Top-right emerald orb */}
      <motion.div
        className="absolute -top-40 -right-32 w-[640px] h-[640px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--accent-primary) 0%, transparent 60%)',
          filter: 'blur(120px)',
          opacity: 0.18,
        }}
        animate={{ x: [0, 30, -20, 0], y: [0, -24, 16, 0] }}
        transition={{ duration: 42, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Mid-left cyan companion */}
      <motion.div
        className="absolute top-1/3 -left-40 w-[520px] h-[520px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--accent-secondary) 0%, transparent 65%)',
          filter: 'blur(110px)',
          opacity: 0.10,
        }}
        animate={{ x: [0, -28, 36, 0], y: [0, 30, -18, 0] }}
        transition={{ duration: 56, repeat: Infinity, ease: 'easeInOut', delay: 6 }}
      />

      {/* Bottom-right deep-emerald accent */}
      <motion.div
        className="absolute -bottom-40 -right-20 w-[460px] h-[460px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--accent-tertiary) 0%, transparent 70%)',
          filter: 'blur(100px)',
          opacity: 0.12,
        }}
        animate={{ x: [0, -16, 24, 0], y: [0, 18, -14, 0] }}
        transition={{ duration: 48, repeat: Infinity, ease: 'easeInOut', delay: 12 }}
      />

      {/* Grid overlay — appears only on dark theme via opacity */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--border-subtle) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse at top, rgba(0,0,0,0.5), transparent 70%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at top, rgba(0,0,0,0.5), transparent 70%)',
        }}
      />
    </div>
  );
}
