'use client';

import { gql, useQuery } from '@apollo/client';
import { formatDateTime } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
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
  created: 'border-blue-400 bg-blue-400',
  active: 'border-emerald-400 bg-emerald-400',
  performing: 'border-emerald-400 bg-emerald-400',
  disbursed: 'border-emerald-400 bg-emerald-400',
  due: 'border-amber-400 bg-amber-400',
  overdue: 'border-orange-400 bg-orange-400',
  delinquent: 'border-red-400 bg-red-400',
  default_status: 'border-red-500 bg-red-500',
  settled: 'border-blue-400 bg-blue-400',
  cancelled: 'border-white/30 bg-white/30',
  written_off: 'border-red-500 bg-red-500',
};

export function TabTimeline({ contractId }: TabTimelineProps) {
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
            <div className="w-3 h-3 rounded-full bg-white/10 mt-1" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/5 rounded w-48" />
              <div className="h-3 bg-white/5 rounded w-32" />
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
        title="No Timeline Events"
        description="No state transitions have been recorded for this contract."
      />
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />
      <div className="space-y-6">
        {events.map((event: any) => {
          const dotColor = stateColors[event.toState] || 'border-white/40 bg-white/40';
          return (
            <div key={event.id} className="relative pl-8">
              <div className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 ${dotColor}`} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {event.fromState && (
                    <>
                      <span className="text-xs text-white/40 uppercase">{event.fromState.replace(/_/g, ' ')}</span>
                      <span className="text-white/20">→</span>
                    </>
                  )}
                  <span className="text-sm font-medium text-white uppercase">{event.toState.replace(/_/g, ' ')}</span>
                </div>
                {event.description && (
                  <p className="text-sm text-white/60 mt-0.5">{event.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-white/30">{formatDateTime(event.createdAt)}</span>
                  {event.actor && <span className="text-xs text-white/20">by {event.actor}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
