interface PageHeaderProps {
  /** Small uppercase live-telemetry pill text (e.g. "Live · Platform telemetry"). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Right-side controls (buttons, status pills). */
  actions?: React.ReactNode;
  /** Whether to show the pulsing live dot before the eyebrow. */
  live?: boolean;
}

/**
 * Standard mission-control page header. Eyebrow + 44px display title +
 * subtitle + right-aligned actions. Used at the top of every dashboard
 * page so they share visual rhythm.
 */
export function PageHeader({ eyebrow, title, subtitle, actions, live = true }: PageHeaderProps) {
  return (
    <header className="relative z-10 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="flex items-center gap-3 mb-3">
            {live && <span className="live-dot" aria-hidden />}
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)] text-[32px] leading-[1.05] sm:text-[40px] md:text-[44px] break-words">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[14px] sm:text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
