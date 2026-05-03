'use client';

import Link from 'next/link';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  href?: string;
  timestamp?: string;
}

interface AlertsPanelProps {
  alerts: AlertItem[];
}

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    badge: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
    labelKey: 'alerts.critical',
  },
  warning: {
    icon: AlertCircle,
    badge: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
    labelKey: 'alerts.warning',
  },
  info: {
    icon: Info,
    badge: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
    labelKey: 'alerts.info',
  },
} as const;

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const { t } = useI18n();

  if (alerts.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="section-label mb-3">{t('alerts.title')}</h3>
        <p className="text-sm text-[color:var(--text-tertiary)]">{t('alerts.noAlerts')}</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="section-label mb-3">
        {t('alerts.title')}{' '}
        <span className="text-xs text-[color:var(--text-tertiary)]">({alerts.length})</span>
      </h3>
      <div className="space-y-2">
        {alerts.map((alert) => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;
          const content = (
            <div
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-muted)] transition-colors',
                alert.href && 'cursor-pointer',
              )}
            >
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.badge.split(' ')[1])} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                      config.badge,
                    )}
                  >
                    {t(config.labelKey)}
                  </span>
                  {alert.timestamp && (
                    <span className="text-[10px] text-[color:var(--text-tertiary)]">{alert.timestamp}</span>
                  )}
                </div>
                <p className="text-sm text-[color:var(--text-primary)] truncate">{alert.message}</p>
              </div>
            </div>
          );

          return alert.href ? (
            <Link key={alert.id} href={alert.href}>
              {content}
            </Link>
          ) : (
            <div key={alert.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
