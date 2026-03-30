'use client';

import { useState, useEffect, useCallback } from 'react';
import { notFound } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';

// Environment guard — only available in staging debug mode
if (process.env.NEXT_PUBLIC_STAGING_DEBUG_MODE !== 'true') {
  // This is checked at module level and also at render time below
}

const DEBUG_API_LOGS = gql`
  query DebugApiLogs($limit: Int) {
    debugApiLogs(limit: $limit) {
      id
      method
      url
      statusCode
      responseTimeMs
      requestBody
      responseBody
      timestamp
    }
  }
`;

const DEBUG_ADAPTER_LOGS = gql`
  query DebugAdapterLogs($limit: Int) {
    debugAdapterLogs(limit: $limit) {
      id
      adapterType
      operation
      input
      output
      latencyMs
      success
      timestamp
    }
  }
`;

const DEBUG_EVENTS = gql`
  query DebugEvents($limit: Int) {
    debugEvents(limit: $limit) {
      id
      eventName
      payload
      timestamp
    }
  }
`;

const DEBUG_STATE_TRANSITIONS = gql`
  query DebugStateTransitions($entityId: String!) {
    debugStateTransitions(entityId: $entityId) {
      id
      entityId
      entityType
      fromState
      toState
      metadata
      timestamp
    }
  }
`;

interface ApiLog {
  id: string;
  method: string;
  url: string;
  statusCode: number;
  responseTimeMs: number;
  requestBody?: any;
  responseBody?: any;
  timestamp: string;
}

interface AdapterLog {
  id: string;
  adapterType: string;
  operation: string;
  input?: any;
  output?: any;
  latencyMs: number;
  success: boolean;
  timestamp: string;
}

interface DebugEventItem {
  id: string;
  eventName: string;
  payload?: any;
  timestamp: string;
}

interface StateTransition {
  id: string;
  entityId: string;
  entityType: string;
  fromState: string;
  toState: string;
  metadata?: any;
  timestamp: string;
}

const TABS = [
  { key: 'api', label: 'API Call Log' },
  { key: 'adapter', label: 'Adapter Operations' },
  { key: 'events', label: 'Event Bus' },
  { key: 'transitions', label: 'State Transitions' },
];

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-500/20 text-blue-400',
    POST: 'bg-emerald-500/20 text-emerald-400',
    PUT: 'bg-amber-500/20 text-amber-400',
    PATCH: 'bg-orange-500/20 text-orange-400',
    DELETE: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${colors[method] || 'bg-white/10 text-white/60'}`}>
      {method}
    </span>
  );
}

function StatusBadge({ code }: { code: number }) {
  const color = code < 300 ? 'text-emerald-400' : code < 400 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono text-sm ${color}`}>{code}</span>;
}

function SuccessBadge({ success }: { success: boolean }) {
  return success ? (
    <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">OK</span>
  ) : (
    <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">FAIL</span>
  );
}

function ExpandableJson({ data }: { data: any }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return <span className="text-white/20">--</span>;
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-400 hover:text-blue-300 font-mono"
      >
        {expanded ? 'collapse' : 'expand'}
      </button>
      {expanded && (
        <pre className="mt-1 text-xs text-white/60 bg-white/5 rounded p-2 max-w-md overflow-auto max-h-40">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ApiLogTab() {
  const { data, loading } = useQuery(DEBUG_API_LOGS, {
    variables: { limit: 50 },
    pollInterval: 5000,
  });

  if (loading && !data) return <SkeletonTable rows={8} columns={5} />;

  const logs: ApiLog[] = data?.debugApiLogs ?? [];

  const columns = [
    { header: 'Method', accessor: (row: ApiLog) => <MethodBadge method={row.method} /> },
    { header: 'URL', accessor: 'url' as const, className: 'font-mono text-xs max-w-xs truncate' },
    { header: 'Status', accessor: (row: ApiLog) => <StatusBadge code={row.statusCode} /> },
    { header: 'Time (ms)', accessor: (row: ApiLog) => <span className="font-mono">{row.responseTimeMs}</span> },
    { header: 'Timestamp', accessor: (row: ApiLog) => formatDateTime(row.timestamp) },
  ];

  return <DataTable columns={columns} data={logs} emptyMessage="No API logs captured yet" />;
}

function AdapterLogTab() {
  const { data, loading } = useQuery(DEBUG_ADAPTER_LOGS, {
    variables: { limit: 50 },
    pollInterval: 5000,
  });

  if (loading && !data) return <SkeletonTable rows={8} columns={5} />;

  const logs: AdapterLog[] = data?.debugAdapterLogs ?? [];

  const columns = [
    { header: 'Adapter', accessor: 'adapterType' as const, className: 'font-mono text-xs' },
    { header: 'Operation', accessor: 'operation' as const },
    { header: 'Latency (ms)', accessor: (row: AdapterLog) => <span className="font-mono">{row.latencyMs}</span> },
    { header: 'Result', accessor: (row: AdapterLog) => <SuccessBadge success={row.success} /> },
    { header: 'Timestamp', accessor: (row: AdapterLog) => formatDateTime(row.timestamp) },
  ];

  return <DataTable columns={columns} data={logs} emptyMessage="No adapter logs captured yet" />;
}

function EventBusTab() {
  const { data, loading } = useQuery(DEBUG_EVENTS, {
    variables: { limit: 50 },
    pollInterval: 5000,
  });

  if (loading && !data) return <SkeletonTable rows={8} columns={3} />;

  const events: DebugEventItem[] = data?.debugEvents ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Event Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Timestamp</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Payload</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={3} className="text-center py-8 text-white/40">No events captured yet</td>
            </tr>
          ) : (
            events.map((evt) => (
              <tr key={evt.id} className="border-b border-white/5">
                <td className="px-4 py-3 text-sm text-white font-mono">{evt.eventName}</td>
                <td className="px-4 py-3 text-sm text-white">{formatDateTime(evt.timestamp)}</td>
                <td className="px-4 py-3 text-sm text-white">
                  <ExpandableJson data={evt.payload} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StateTransitionsTab() {
  const [entityId, setEntityId] = useState('');
  const [searchId, setSearchId] = useState('');

  const { data, loading } = useQuery(DEBUG_STATE_TRANSITIONS, {
    variables: { entityId: searchId },
    skip: !searchId,
    pollInterval: 5000,
  });

  const transitions: StateTransition[] = data?.debugStateTransitions ?? [];

  const handleSearch = useCallback(() => {
    if (entityId.trim()) {
      setSearchId(entityId.trim());
    }
  }, [entityId]);

  return (
    <div>
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Enter entity ID to search..."
          className="flex-1 px-4 py-2 rounded bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded text-sm font-medium hover:bg-blue-500/30 transition-colors"
        >
          Search
        </button>
      </div>

      {!searchId ? (
        <div className="text-center py-12 text-white/40">
          Enter an entity ID to view its state transitions
        </div>
      ) : loading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : transitions.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          No state transitions found for this entity
        </div>
      ) : (
        <div className="space-y-3">
          {transitions.map((t, idx) => (
            <div key={t.id} className="flex items-start gap-4 relative">
              {/* Timeline line */}
              {idx < transitions.length - 1 && (
                <div className="absolute left-[11px] top-6 bottom-0 w-px bg-white/10" />
              )}
              {/* Timeline dot */}
              <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-400/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
              </div>
              {/* Content */}
              <div className="glass p-4 flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs text-white/40 font-mono">{t.entityType}</span>
                  <span className="text-xs text-white/20">|</span>
                  <span className="text-xs text-white/40">{formatDateTime(t.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2 py-0.5 rounded bg-white/10 text-white/60 font-mono text-xs">
                    {t.fromState}
                  </span>
                  <span className="text-white/30">&rarr;</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono text-xs">
                    {t.toState}
                  </span>
                </div>
                {t.metadata && (
                  <div className="mt-2">
                    <ExpandableJson data={t.metadata} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DebugPage() {
  // Runtime environment guard
  if (process.env.NEXT_PUBLIC_STAGING_DEBUG_MODE !== 'true') {
    notFound();
  }

  const [activeTab, setActiveTab] = useState('api');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white/80">Debug Panel</h1>
          <p className="text-sm text-amber-400/80 mt-1">Staging only -- not available in production</p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
          DEBUG MODE
        </span>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="glass p-4">
        {activeTab === 'api' && <ApiLogTab />}
        {activeTab === 'adapter' && <AdapterLogTab />}
        {activeTab === 'events' && <EventBusTab />}
        {activeTab === 'transitions' && <StateTransitionsTab />}
      </div>
    </div>
  );
}
