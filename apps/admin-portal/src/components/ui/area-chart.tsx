'use client';

import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

interface DataPoint {
  label: string;
  value: number;
}

interface AreaChartProps {
  data: DataPoint[];
  height?: number;
  pinIndex?: number;
  pinLabel?: string;
  color?: string;
  className?: string;
  /** Accessible label for assistive tech (e.g. "Tenant growth, last 12 months"). */
  ariaLabel?: string;
}

const PADDING = { top: 28, right: 16, bottom: 28, left: 16 };

/**
 * Full-width area chart with a soft gradient fill, hover crosshair, and an
 * optional floating value pin (the "100k" callout in the reference). Built
 * on raw SVG so it inherits CSS variables and animates cleanly without
 * recharts' wrapping overhead for this single use case.
 */
export function AreaChart({
  data,
  height = 220,
  pinIndex,
  pinLabel,
  color = 'var(--accent-primary)',
  className,
  ariaLabel,
}: AreaChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gradId = useId();

  const { paths, points, ticks, width } = useMemo(() => {
    const w = 800;
    const innerW = w - PADDING.left - PADDING.right;
    const innerH = height - PADDING.top - PADDING.bottom;

    const min = 0;
    const max = Math.max(...data.map((d) => d.value)) * 1.1 || 1;

    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const pts = data.map((d, i) => {
      const x = PADDING.left + i * stepX;
      const y = PADDING.top + (1 - (d.value - min) / (max - min)) * innerH;
      return { x, y, value: d.value, label: d.label };
    });

    let line = '';
    pts.forEach((p, i) => {
      if (i === 0) line += `M ${p.x} ${p.y}`;
      else {
        const prev = pts[i - 1];
        const cx = (prev.x + p.x) / 2;
        line += ` C ${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
      }
    });

    const area = `${line} L ${pts[pts.length - 1].x} ${height - PADDING.bottom} L ${pts[0].x} ${height - PADDING.bottom} Z`;

    const tickStep = Math.max(1, Math.floor(data.length / 8));
    const t = data.map((d, i) => ({ label: d.label, x: pts[i].x, show: i % tickStep === 0 }));

    return { paths: { line, area }, points: pts, ticks: t, width: w };
  }, [data, height]);

  const pin = pinIndex != null && pinIndex >= 0 && pinIndex < points.length ? points[pinIndex] : null;
  const active = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div className={className} style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel ?? 'Time series chart'}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const xRatio = (e.clientX - rect.left) / rect.width;
          const xInSvg = xRatio * width;
          let nearest = 0;
          let nearestDist = Infinity;
          points.forEach((p, i) => {
            const d = Math.abs(p.x - xInSvg);
            if (d < nearestDist) {
              nearestDist = d;
              nearest = i;
            }
          });
          setHoverIdx(nearest);
        }}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="60%" stopColor={color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75].map((r) => {
          const y = PADDING.top + r * (height - PADDING.top - PADDING.bottom);
          return (
            <line
              key={r}
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
              strokeDasharray="2 4"
              strokeWidth="1"
            />
          );
        })}

        {/* Area fill — animates in */}
        <motion.path
          d={paths.area}
          fill={`url(#${gradId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        />

        {/* Line — draws in */}
        <motion.path
          d={paths.line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1] }}
        />

        {/* Hover crosshair */}
        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={PADDING.top}
              y2={height - PADDING.bottom}
              stroke={color}
              strokeOpacity="0.32"
              strokeDasharray="2 4"
              strokeWidth="1"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="5"
              fill="var(--bg-page)"
              stroke={color}
              strokeWidth="2"
            />
          </>
        )}

        {/* Pin marker */}
        {pin && (
          <>
            <line
              x1={pin.x}
              x2={pin.x}
              y1={pin.y + 18}
              y2={pin.y + 36}
              stroke={color}
              strokeWidth="1.5"
              strokeOpacity="0.6"
            />
            <circle cx={pin.x} cy={pin.y} r="5" fill={color} />
            <circle cx={pin.x} cy={pin.y} r="9" fill={color} fillOpacity="0.18" />
          </>
        )}

        {/* X-axis labels */}
        {ticks.map(
          (t, i) =>
            t.show && (
              <text
                key={i}
                x={t.x}
                y={height - 6}
                textAnchor="middle"
                fill="var(--text-tertiary)"
                fontSize="11"
                fontFamily="inherit"
              >
                {t.label}
              </text>
            ),
        )}
      </svg>

      {/* Floating tooltip / pin label rendered as DOM for crisp text */}
      {(active || pin) && (
        <div
          className="relative pointer-events-none"
          style={{ height: 0, marginTop: -height }}
        >
          {pin && pinLabel && !active && (
            <FloatingPinLabel
              x={pin.x}
              y={pin.y}
              chartWidth={width}
              chartHeight={height}
              label={pinLabel}
              value={pin.value}
              color={color}
            />
          )}
          {active && (
            <FloatingPinLabel
              x={active.x}
              y={active.y}
              chartWidth={width}
              chartHeight={height}
              label={active.label}
              value={active.value}
              color={color}
              ephemeral
            />
          )}
        </div>
      )}
    </div>
  );
}

function FloatingPinLabel({
  x,
  y,
  chartWidth,
  chartHeight,
  label,
  value,
  color,
  ephemeral,
}: {
  x: number;
  y: number;
  chartWidth: number;
  chartHeight: number;
  label: string;
  value: number;
  color: string;
  ephemeral?: boolean;
}) {
  const xPct = (x / chartWidth) * 100;
  const yPct = (y / chartHeight) * 100;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: 'translate(-50%, -150%)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium tabular-nums whitespace-nowrap shadow-lg"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: `1px solid ${color}`,
          color: 'var(--text-primary)',
          boxShadow: `0 8px 24px -6px ${color}33`,
        }}
      >
        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          {label}
        </div>
        <div style={{ color }}>{formatValue(value)}{ephemeral ? '' : ''}</div>
      </motion.div>
    </div>
  );
}

function formatValue(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString();
}
