import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type MetricVariant = 'standard' | 'hero' | 'flush' | 'glow' | 'glow-hero';

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  delta?: string;
  icon?: React.ReactNode;
  variant?: MetricVariant;
  /** Optional chart slot rendered below the title row (sparkline, gauge, etc.). */
  chart?: React.ReactNode;
  /** Optional footer slot rendered below the value (progress bar, extra info). */
  footer?: React.ReactNode;
  /** Optional live indicator dot in the header. */
  live?: boolean;
  className?: string;
}

/**
 * KPI metric display with five variants for typographic + visual hierarchy:
 *
 * - `glow-hero` — Dark mission-control hero card with emerald edge glow.
 * - `glow`      — Compact mission-control card with emerald edge glow.
 * - `hero`      — Light-mode warm tinted hero card.
 * - `standard`  — Clean bordered card.
 * - `flush`     — No card chrome — just value + label.
 */
export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  delta,
  icon,
  variant = 'standard',
  chart,
  footer,
  live,
  className,
}: MetricCardProps) {
  const trendPositive = trend === 'up';
  const trendNegative = trend === 'down';
  const deltaNode = (trendPositive || trendNegative) && delta && (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
        trendPositive && 'text-[color:var(--status-success-text)]',
        trendNegative && 'text-[color:var(--status-error-text)]',
      )}
    >
      {trendPositive ? (
        <ArrowUpRight className="w-3.5 h-3.5" />
      ) : (
        <ArrowDownRight className="w-3.5 h-3.5" />
      )}
      {delta}
    </span>
  );

  if (variant === 'glow-hero') {
    return (
      <div
        className={cn(
          'card-glow-hero card-glow-sweep p-7 lg:p-8 flex flex-col gap-4 relative min-h-[220px] justify-between',
          className,
        )}
      >
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2">
            {live && <span className="live-dot" aria-hidden />}
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">
              {title}
            </p>
          </div>
          {icon && (
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {icon}
            </span>
          )}
        </div>

        {chart && <div className="relative">{chart}</div>}

        <div className="flex items-end gap-3 relative">
          <p
            className="font-semibold tabular-nums leading-none"
            style={{
              fontSize: 56,
              letterSpacing: '-0.038em',
              color: 'var(--accent-primary-deep)',
              textShadow: '0 0 28px rgba(var(--accent-primary-rgb), 0.35)',
            }}
          >
            {value}
          </p>
          {deltaNode}
        </div>

        {subtitle && (
          <p className="text-sm text-[color:var(--text-secondary)] relative">{subtitle}</p>
        )}

        {footer}
      </div>
    );
  }

  if (variant === 'glow') {
    return (
      <div
        className={cn(
          'card-glow p-5 flex flex-col gap-3 relative',
          className,
        )}
      >
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2 min-w-0">
            {live && <span className="live-dot" aria-hidden />}
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-tertiary)] truncate">
              {title}
            </p>
          </div>
          {icon && (
            <span className="text-[color:var(--accent-primary-deep)] flex-shrink-0">
              {icon}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2 relative">
          <p
            className="font-semibold tabular-nums leading-none"
            style={{
              fontSize: 32,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            {value}
          </p>
          {deltaNode}
        </div>

        {subtitle && (
          <p className="text-[12px] text-[color:var(--text-tertiary)] relative">{subtitle}</p>
        )}

        {chart}
        {footer}
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div
        className={cn(
          'card-tinted p-8 lg:p-10 flex flex-col gap-5 relative overflow-hidden min-h-[260px] justify-between',
          className,
        )}
      >
        <div
          aria-hidden
          className="absolute -right-8 -top-8 w-40 h-40 rounded-full blur-3xl pointer-events-none"
          style={{
            background: 'radial-gradient(circle, var(--accent-primary-soft), transparent 70%)',
            animation: 'kpiGlowBreath 6s ease-in-out infinite',
            transformOrigin: 'center',
          }}
        />
        <div className="flex items-center justify-between relative">
          <p className="kpi-hero-label">{title}</p>
          {icon && (
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
              }}
            >
              {icon}
            </span>
          )}
        </div>
        <div className="flex items-end gap-3 relative">
          <p className="kpi-hero-value">{value}</p>
          {deltaNode}
        </div>
        {subtitle && (
          <p className="text-sm text-[color:var(--text-secondary)] relative">{subtitle}</p>
        )}
        {footer}
      </div>
    );
  }

  if (variant === 'flush') {
    return (
      <div className={cn('flex flex-col gap-1.5 py-3', className)}>
        <div className="flex items-center gap-2">
          {icon && <span className="text-[color:var(--text-tertiary)]">{icon}</span>}
          <p className="text-[13px] font-medium text-[color:var(--text-secondary)]">{title}</p>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="kpi-value">{value}</p>
          {deltaNode}
        </div>
        {subtitle && <p className="text-xs text-[color:var(--text-tertiary)]">{subtitle}</p>}
        {footer}
      </div>
    );
  }

  // Standard
  return (
    <div
      className={cn(
        'card p-7 flex flex-col gap-3.5 transition-all duration-200 ease-out',
        'hover:shadow-elevated hover:-translate-y-0.5 active:scale-[0.99]',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[color:var(--text-secondary)]">{title}</p>
        {icon && <span className="text-[color:var(--text-tertiary)]">{icon}</span>}
      </div>
      <div className="flex items-end gap-3">
        <p className="kpi-value">{value}</p>
        {deltaNode}
      </div>
      {subtitle && <p className="text-xs text-[color:var(--text-secondary)]">{subtitle}</p>}
      {footer}
    </div>
  );
}
