'use client';

import { gql, useQuery } from '@apollo/client';
import { formatDateTime } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/i18n';
import { GitBranch } from 'lucide-react';

const CONTRACT_TIMELINE_QUERY = gql`
  query ContractTimeline($contractId: ID!) {
    contractTimeline(contractId: $contractId) {
      id fromState toState description actor createdAt
    }
  }
`;

interface TabTimelineProps {
  contractId: string;
}

const stateColors: Record<string, string> = {
  created: 'border-[color:var(--accent-primary)] bg-[color:var(--accent-primary)]',
  active: 'border-[color:var(--status-success-text)] bg-[color:var(--status-success-text)]',
  performing: 'border-[color:var(--status-success-text)] bg-[color:var(--status-success-text)]',
  disbursed: 'border-[color:var(--status-success-text)] bg-[color:var(--status-success-text)]',
  due: 'border-[color:var(--status-warning-text)] bg-[color:var(--status-warning-text)]',
  overdue: 'border-[color:var(--status-warning-text)] bg-[color:var(--status-warning-text)]',
  delinquent: 'border-[color:var(--status-error-text)] bg-[color:var(--status-error-text)]',
  default_status: 'border-[color:var(--status-error-text)] bg-[color:var(--status-error-text)]',
  settled: 'border-[color:var(--accent-primary)] bg-[color:var(--accent-primary)]',
  cancelled: 'border-[color:var(--text-tertiary)] bg-[color:var(--text-tertiary)]',
  written_off: 'border-[color:var(--status-error-text)] bg-[color:var(--status-error-text)]',
};

export function TabTimeline({ contractId }: TabTimelineProps) {
  const { t } = useI18n();
  const { data, loading } = useQuery(CONTRACT_TIMELINE_QUERY, {
    variables: { contractId },
    fetchPolicy: 'cache-and-network',
  });

  const events = data?.contractTimeline || [];

  if (loading && events.length === 0) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="w-3 h-3 rounded-full bg-[color:var(--bg-muted)] mt-1" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[color:var(--bg-muted)] rounded w-48" />
              <div className="h-3 bg-[color:var(--bg-muted)] rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title={t('loans.timeline.emptyTitle')}
        description={t('loans.timeline.emptyDescription')}
      />
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[color:var(--bg-muted)]" />
      <div className="space-y-6">
        {events.map((event: any) => {
          const dotColor = stateColors[event.toState] || 'border-[color:var(--text-tertiary)] bg-[color:var(--text-tertiary)]';
          return (
            <div key={event.id} className="relative pl-8">
              <div className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 ${dotColor}`} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {event.fromState && (
                    <>
                      <span className="text-xs text-[color:var(--text-tertiary)] uppercase">{event.fromState.replace(/_/g, ' ')}</span>
                      <span className="text-[color:var(--text-tertiary)]">→</span>
                    </>
                  )}
                  <span className="text-sm font-medium text-[color:var(--text-primary)] uppercase">{event.toState.replace(/_/g, ' ')}</span>
                </div>
                {event.description && (
                  <p className="text-sm text-[color:var(--text-secondary)] mt-0.5">{event.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[color:var(--text-tertiary)]">{formatDateTime(event.createdAt)}</span>
                  {event.actor && <span className="text-xs text-[color:var(--text-tertiary)]">{t('loans.timeline.byActor', { actor: event.actor })}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
