'use client';

import React, { useState, useCallback } from 'react';
import { notFound } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { Tabs } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';

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

const DEBUG_SCORING_BREAKDOWNS = gql`
  query DebugScoringBreakdowns($limit: Int) {
    debugScoringBreakdowns(limit: $limit) {
      id
      customerId
      loanRequestId
      scoringModel
      finalScore
      decision
      rules {
        ruleName
        passed
        score
        weight
        weightedScore
        reason
      }
      executedAt
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

interface ScoringRule {
  ruleName: string;
  passed: boolean;
  score: number;
  weight: number;
  weightedScore: number;
  reason?: string;
}

interface ScoringBreakdown {
  id: string;
  customerId: string;
  loanRequestId: string;
  scoringModel: string;
  finalScore: number;
  decision: string;
  rules: ScoringRule[];
  executedAt: string;
}

function useDebugTabs() {
  const { t } = useI18n();
  return [
    { key: 'api', label: t('debug.tab.apiCallLog') },
    { key: 'adapter', label: t('debug.tab.adapterOps') },
    { key: 'events', label: t('debug.tab.eventBus') },
    { key: 'transitions', label: t('debug.tab.stateTransitions') },
    { key: 'scoring', label: t('debug.tab.scoringBreakdowns') },
  ];
}

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
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!data) return <span className="text-white/20">--</span>;
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-400 hover:text-blue-300 font-mono"
      >
        {expanded ? t('debug.collapse') : t('debug.expand')}
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
  const { t } = useI18n();
  const { data, loading } = useQuery(DEBUG_API_LOGS, {
    variables: { limit: 50 },
    pollInterval: 5000,
  });

  if (loading && !data) return <SkeletonTable rows={8} columns={5} />;

  const logs: ApiLog[] = data?.debugApiLogs ?? [];

  const columns = [
    { header: t('debug.apiLog.column.method'), accessor: (row: ApiLog) => <MethodBadge method={row.method} /> },
    { header: t('debug.apiLog.column.url'), accessor: 'url' as const, className: 'font-mono text-xs max-w-xs truncate' },
    { header: t('debug.apiLog.column.status'), accessor: (row: ApiLog) => <StatusBadge code={row.statusCode} /> },
    { header: t('debug.apiLog.column.timeMs'), accessor: (row: ApiLog) => <span className="font-mono">{row.responseTimeMs}</span> },
    { header: t('debug.apiLog.column.timestamp'), accessor: (row: ApiLog) => formatDateTime(row.timestamp) },
  ];

  return <DataTable columns={columns} data={logs} emptyMessage={t('debug.apiLog.emptyMessage')} />;
}

function AdapterLogTab() {
  const { t } = useI18n();
  const { data, loading } = useQuery(DEBUG_ADAPTER_LOGS, {
    variables: { limit: 50 },
    pollInterval: 5000,
  });

  if (loading && !data) return <SkeletonTable rows={8} columns={5} />;

  const logs: AdapterLog[] = data?.debugAdapterLogs ?? [];

  const columns = [
    { header: t('debug.adapter.column.adapter'), accessor: 'adapterType' as const, className: 'font-mono text-xs' },
    { header: t('debug.adapter.column.operation'), accessor: 'operation' as const },
    { header: t('debug.adapter.column.latencyMs'), accessor: (row: AdapterLog) => <span className="font-mono">{row.latencyMs}</span> },
    { header: t('debug.adapter.column.result'), accessor: (row: AdapterLog) => <SuccessBadge success={row.success} /> },
    { header: t('debug.adapter.column.timestamp'), accessor: (row: AdapterLog) => formatDateTime(row.timestamp) },
  ];

  return <DataTable columns={columns} data={logs} emptyMessage={t('debug.adapter.emptyMessage')} />;
}

function EventBusTab() {
  const { t } = useI18n();
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
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.eventBus.column.eventName')}</th>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.eventBus.column.timestamp')}</th>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.eventBus.column.payload')}</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={3} className="text-center py-8 text-white/40">{t('debug.eventBus.emptyMessage')}</td>
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
  const { t } = useI18n();
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
          placeholder={t('debug.stateTransitions.placeholder')}
          className="flex-1 px-4 py-2 rounded bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded text-sm font-medium hover:bg-blue-500/30 transition-colors"
        >
          {t('common.search')}
        </button>
      </div>

      {!searchId ? (
        <div className="text-center py-12 text-white/40">
          {t('debug.stateTransitions.emptyPrompt')}
        </div>
      ) : loading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : transitions.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          {t('debug.stateTransitions.emptyMessage')}
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
              <div className="card p-4 flex-1">
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

function DecisionBadge({ decision }: { decision: string }) {
  const colors: Record<string, string> = {
    APPROVED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    DECLINED: 'bg-red-500/20 text-red-400 border-red-500/30',
    MANUAL_REVIEW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[decision] || 'bg-white/10 text-white/60'}`}>
      {decision}
    </span>
  );
}

function ScoreBar({ score, max = 1000 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-white/60">{score.toFixed(1)}</span>
    </div>
  );
}

function ScoringBreakdownsTab() {
  const { t } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, loading } = useQuery(DEBUG_SCORING_BREAKDOWNS, {
    variables: { limit: 50 },
    pollInterval: 5000,
  });

  if (loading && !data) return <SkeletonTable rows={8} columns={6} />;

  const breakdowns: ScoringBreakdown[] = data?.debugScoringBreakdowns ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.scoring.column.customer')}</th>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.scoring.column.loanRequest')}</th>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.scoring.column.model')}</th>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.scoring.column.finalScore')}</th>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.scoring.column.decision')}</th>
            <th className="px-4 py-3 text-left text-[13px] font-medium text-[color:var(--text-secondary)]">{t('debug.scoring.column.executedAt')}</th>
          </tr>
        </thead>
        <tbody>
          {breakdowns.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-8 text-white/40">{t('debug.scoring.emptyMessage')}</td>
            </tr>
          ) : (
            breakdowns.map((b) => (
              <React.Fragment key={b.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-white/70 font-mono text-xs">{b.customerId.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-sm text-white/70 font-mono text-xs">{b.loanRequestId.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-sm text-white/80">{b.scoringModel}</td>
                  <td className="px-4 py-3"><ScoreBar score={b.finalScore} /></td>
                  <td className="px-4 py-3"><DecisionBadge decision={b.decision} /></td>
                  <td className="px-4 py-3 text-sm text-white/50 text-xs">{formatDateTime(b.executedAt)}</td>
                </tr>
                {expandedId === b.id && b.rules.length > 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 bg-white/5">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-white/30">
                            <th className="px-3 py-2 text-left">{t('debug.scoring.rule.ruleName')}</th>
                            <th className="px-3 py-2 text-left">{t('debug.scoring.rule.passed')}</th>
                            <th className="px-3 py-2 text-left">{t('debug.scoring.rule.rawScore')}</th>
                            <th className="px-3 py-2 text-left">{t('debug.scoring.rule.weight')}</th>
                            <th className="px-3 py-2 text-left">{t('debug.scoring.rule.weighted')}</th>
                            <th className="px-3 py-2 text-left">{t('debug.scoring.rule.reason')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.rules.map((rule, idx) => (
                            <tr key={idx} className="border-t border-white/5">
                              <td className="px-3 py-2 text-white/70 font-mono">{rule.ruleName}</td>
                              <td className="px-3 py-2">
                                {rule.passed ? (
                                  <span className="text-emerald-400">&#10003;</span>
                                ) : (
                                  <span className="text-red-400">&#10007;</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-white/60 font-mono">{rule.score.toFixed(1)}</td>
                              <td className="px-3 py-2 text-white/60 font-mono">{rule.weight.toFixed(2)}</td>
                              <td className="px-3 py-2 text-white/60 font-mono">{rule.weightedScore.toFixed(1)}</td>
                              <td className="px-3 py-2 text-white/50">{rule.reason ?? '--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function DebugPage() {
  // Runtime environment guard
  if (process.env.NEXT_PUBLIC_STAGING_DEBUG_MODE !== 'true') {
    notFound();
  }

  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('api');
  const tabs = useDebugTabs();

  return (
    <div className="relative space-y-8 animate-enter">
      <header className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: 'var(--status-warning)',
                boxShadow: '0 0 8px var(--status-warning)',
                animation: 'liveDot 1800ms ease-in-out infinite',
              }}
              aria-hidden
            />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--status-warning-text)]">
              {t('debug.eyebrow')}
            </span>
          </div>
          <h1
            className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
            style={{ fontSize: 44, lineHeight: 1.05 }}
          >
            {t('debug.title')}
          </h1>
          <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
            {t('debug.subtitle')}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--status-warning-soft)',
            color: 'var(--status-warning-text)',
            border: '1px solid var(--status-warning)',
          }}
        >
          {t('debug.modeBadge')}
        </span>
      </header>

      <div className="relative z-10">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="relative z-10 card-glow overflow-hidden">
        {activeTab === 'api' && <ApiLogTab />}
        {activeTab === 'adapter' && <AdapterLogTab />}
        {activeTab === 'events' && <EventBusTab />}
        {activeTab === 'transitions' && <StateTransitionsTab />}
        {activeTab === 'scoring' && <ScoringBreakdownsTab />}
      </div>
    </div>
  );
}
