'use client';

import { useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  className?: string;
}

/**
 * Tiny inline area chart for KPI cards. SVG-only, no external deps so it
 * stays cheap to mount in dozens of cards. Coordinates are normalized into
 * the viewBox; consumers control on-page size via width/height props or
 * className with the `aspect-` utilities.
 */
export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = 'var(--accent-primary)',
  fill,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  if (data.length < 2) return null;

  const padY = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const stepX = (width - 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = 1 + i * stepX;
    const y = padY + (1 - (v - min) / range) * (height - 2 * padY);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L ${width - 1} ${height - 1} L 1 ${height - 1} Z`;

  const gradId = useId();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fill ? 0 : 0.34} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={fill ?? `url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
