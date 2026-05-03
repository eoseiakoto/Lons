'use client';

import { motion } from 'framer-motion';
import { useId } from 'react';

interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  sublabel?: string;
  size?: number;
  className?: string;
}

/**
 * Semicircular gauge — emerald → cyan gradient arc with the percentage
 * seated inside the open mouth of the arc. Stroke and font scale with
 * size so the value never crosses the curve regardless of how small the
 * gauge is rendered.
 */
export function Gauge({
  value,
  min = 0,
  max = 100,
  label,
  sublabel,
  size = 200,
  className,
}: GaugeProps) {
  const gradId = useId();
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  // Stroke and font both scale with size — keeps proportions consistent
  // across the 90px Match-Rate card and the 200px hero gauge.
  const stroke = Math.max(8, Math.round(size * 0.07));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const arcLen = Math.PI * r;

  const startX = cx - r;
  const endX = cx + r;
  const arcPath = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`;
  const dashOffset = arcLen * (1 - pct);

  // Value text — fontSize ≤ ~22% of size keeps the text width comfortably
  // inside the arc chord at the text's vertical band, so the digits never
  // intersect the curve.
  const valueFontSize = Math.max(14, Math.round(size * 0.22));
  // Position so the text BOTTOM sits ~2px above the arc's flat edge (cy),
  // placing the digits cleanly in the lower half of the open mouth.
  const valueTop = cy - valueFontSize - 2;
  const svgHeight = size / 2 + stroke / 2;

  const percent = Math.round(pct * 100);
  const a11yLabel = label
    ? `${label}: ${percent} percent${sublabel ? `, ${sublabel}` : ''}`
    : `${percent} percent`;

  return (
    <div
      className={className}
      style={{ width: size }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={a11yLabel}
    >
      <div style={{ position: 'relative', width: size, height: svgHeight }} aria-hidden>
        <svg
          viewBox={`0 0 ${size} ${svgHeight}`}
          width={size}
          height={svgHeight}
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--status-info)" />
              <stop offset="50%" stopColor="var(--accent-primary)" />
              <stop offset="100%" stopColor="var(--accent-primary-deep)" />
            </linearGradient>
          </defs>

          {/* Track */}
          <path
            d={arcPath}
            fill="none"
            stroke="var(--bg-muted)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />

          {/* Value arc — animates from 0 to value */}
          <motion.path
            d={arcPath}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={arcLen}
            initial={{ strokeDashoffset: arcLen }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.4, ease: [0.23, 1, 0.32, 1], delay: 0.2 }}
          />

          {/* Tick marks at 0 / 50 / 100 — subtle, only on larger gauges */}
          {size >= 140 &&
            [0, 0.5, 1].map((t) => {
              const angle = Math.PI - t * Math.PI;
              const innerR = r - stroke / 2 - 4;
              const outerR = r - stroke / 2 - 1;
              const x1 = cx + Math.cos(angle) * innerR;
              const y1 = cy - Math.sin(angle) * innerR;
              const x2 = cx + Math.cos(angle) * outerR;
              const y2 = cy - Math.sin(angle) * outerR;
              return (
                <line
                  key={t}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--text-tertiary)"
                  strokeWidth="1"
                  strokeOpacity="0.4"
                />
              );
            })}
        </svg>

        {/* Value text — positioned inside the open arc, baseline above cy */}
        <div
          className="absolute left-0 right-0 flex justify-center pointer-events-none"
          style={{ top: valueTop, height: valueFontSize }}
        >
          <span
            className="font-semibold tabular-nums leading-none"
            style={{
              fontSize: valueFontSize,
              color: 'var(--accent-primary-deep)',
              letterSpacing: '-0.025em',
            }}
          >
            {Math.round(pct * 100)}%
          </span>
        </div>
      </div>

      {(label || sublabel) && (
        <div className="text-center mt-2">
          {label && (
            <div className="text-[11px] uppercase tracking-wider text-[color:var(--text-secondary)] font-medium">
              {label}
            </div>
          )}
          {sublabel && (
            <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">
              {sublabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
