'use client';

import Link from 'next/link';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Critical',
  },
  warning: {
    icon: AlertCircle,
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    label: 'Warning',
  },
  info: {
    icon: Info,
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    label: 'Info',
  },
};

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="glass p-6">
        <h3 className="text-sm font-medium text-white/60 mb-3">Alerts</h3>
        <p className="text-sm text-white/30">No active alerts</p>
      </div>
    );
  }

  return (
    <div className="glass p-5">
      <h3 className="text-sm font-medium text-white/60 mb-3">
        Alerts{' '}
        <span className="text-xs text-white/30">({alerts.length})</span>
      </h3>
      <div className="space-y-2">
        {alerts.map((alert) => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;
          const content = (
            <div
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors',
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
                    {config.label}
                  </span>
                  {alert.timestamp && (
                    <span className="text-[10px] text-white/30">{alert.timestamp}</span>
                  )}
                </div>
                <p className="text-sm text-white/80 truncate">{alert.message}</p>
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
