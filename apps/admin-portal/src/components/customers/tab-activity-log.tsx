'use client';

import { gql, useQuery } from '@apollo/client';
import { formatDateTime } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Clock } from 'lucide-react';

const CUSTOMER_ACTIVITY_QUERY = gql`
  query CustomerActivity($customerId: ID!, $pagination: PaginationInput) {
    customerActivity(customerId: $customerId, pagination: $pagination) {
      edges {
        node {
          id eventType description actor metadata createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface TabActivityLogProps {
  customerId: string;
}

export function TabActivityLog({ customerId }: TabActivityLogProps) {
  const { data, loading } = useQuery(CUSTOMER_ACTIVITY_QUERY, {
    variables: { customerId, pagination: { first: 50 } },
    fetchPolicy: 'cache-and-network',
  });

  const events = data?.customerActivity?.edges?.map((e: any) => e.node) || [];

  if (loading && events.length === 0) {
    return (
      <div className="glass p-6">
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
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="glass">
        <EmptyState
          icon={Clock}
          title="No Activity"
          description="No activity has been recorded for this customer yet."
        />
      </div>
    );
  }

  return (
    <div className="glass p-6">
      <div className="relative">
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />
        <div className="space-y-6">
          {events.map((event: any) => (
            <div key={event.id} className="relative pl-8">
              <div className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-blue-400 bg-slate-900" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={event.eventType} />
                  <span className="text-xs text-white/30">{formatDateTime(event.createdAt)}</span>
                </div>
                <p className="text-sm text-white mt-1">{event.description}</p>
                {event.actor && (
                  <p className="text-xs text-white/30 mt-0.5">by {event.actor}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
