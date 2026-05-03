'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { useI18n } from '@/lib/i18n/i18n-context';

const GET_FEEDBACKS = gql`
  query GetFeedbacks(
    $status: FeedbackStatus
    $category: FeedbackCategory
    $severity: FeedbackSeverity
    $first: Int
    $after: String
  ) {
    feedbacks(
      status: $status
      category: $category
      severity: $severity
      first: $first
      after: $after
    ) {
      edges {
        cursor
        node {
          id
          tenantId
          userId
          category
          severity
          description
          screenshotUrl
          pageUrl
          debugContext
          status
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

const NPS_SUMMARY = gql`
  query NpsSummary {
    npsSummary {
      totalResponses
      npsScore
      promoters
      passives
      detractors
      promoterPercentage
      passivePercentage
      detractorPercentage
    }
  }
`;

const UPDATE_FEEDBACK_STATUS = gql`
  mutation UpdateFeedbackStatus($id: ID!, $status: FeedbackStatus!) {
    updateFeedbackStatus(id: $id, status: $status) {
      id
      status
      updatedAt
    }
  }
`;

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'BUG', label: 'Bug' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'UX_ISSUE', label: 'UX Issue' },
  { value: 'INTEGRATION_QUESTION', label: 'Integration Question' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITIES = [
  { value: '', label: 'All Severities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
  { value: 'SUGGESTION', label: 'Suggestion' },
];

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_OPTIONS = STATUSES.filter((s) => s.value !== '');

const severityColors: Record<string, string> = {
  CRITICAL: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
  MAJOR: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  MINOR: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  SUGGESTION: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
};

const statusColors: Record<string, string> = {
  NEW: 'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]',
  ACKNOWLEDGED: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
  IN_PROGRESS: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  RESOLVED: 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
  CLOSED: 'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]',
};

const categoryLabels: Record<string, string> = {
  BUG: 'Bug',
  FEATURE_REQUEST: 'Feature Request',
  UX_ISSUE: 'UX Issue',
  INTEGRATION_QUESTION: 'Integration Question',
  OTHER: 'Other',
};

interface FeedbackNode {
  id: string;
  tenantId: string;
  userId: string;
  category: string;
  severity: string;
  description: string;
  screenshotUrl?: string;
  pageUrl?: string;
  debugContext?: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const PAGE_SIZE = 20;

export default function FeedbackPage() {
  const { t } = useI18n();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackNode | null>(null);
  const { toast } = useToast();

  const { data: npsData } = useQuery(NPS_SUMMARY);
  const nps = npsData?.npsSummary;

  const { data, loading, error, refetch } = useQuery(GET_FEEDBACKS, {
    variables: {
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      severity: severityFilter || undefined,
      first: PAGE_SIZE,
      after: cursor,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [updateStatus, { loading: updating }] = useMutation(UPDATE_FEEDBACK_STATUS);

  const connection = data?.feedbacks;
  const feedbacks: FeedbackNode[] = (connection?.edges || []).map((e: any) => e.node);
  const pageInfo = connection?.pageInfo;

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await updateStatus({ variables: { id, status: newStatus } });
      toast('success', `Feedback status updated to ${newStatus.replace(/_/g, ' ')}`);
      if (selectedFeedback?.id === id) {
        setSelectedFeedback((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      refetch();
    } catch (err: any) {
      toast('error', `Failed to update status: ${err.message ?? 'Unknown error'}`);
    }
  };

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + '...' : text;

  return (
    <div className="relative space-y-8 animate-enter">
      <PageHeader
        eyebrow={t('eyebrow.platformVoice')}
        title="Feedback management"
        subtitle="Feedback submitted by users across every tenant."
      />


      {/* NPS Summary */}
      {nps && nps.totalResponses > 0 && (
        <section>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)] mb-4">NPS Summary</h2>
          <div
            className="stagger-children grid grid-cols-1 md:grid-cols-3 gap-px mb-4"
            style={{ backgroundColor: 'var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
          >
            <div className="p-6" style={{ backgroundColor: 'var(--bg-card)' }}>
              <span className="section-label" style={{ marginBottom: '6px' }}>Total Responses</span>
              <span className="kpi-value">{nps.totalResponses}</span>
            </div>
            <div className="p-6" style={{ backgroundColor: 'var(--bg-card)' }}>
              <span className="section-label" style={{ marginBottom: '6px' }}>Average Score</span>
              <span className="kpi-value">
                {nps.totalResponses > 0
                  ? ((nps.promoters * 9.5 + nps.passives * 7.5 + nps.detractors * 3) / nps.totalResponses).toFixed(1)
                  : '0.0'}
              </span>
              <span className="text-[color:var(--text-tertiary)] text-sm tabular-nums"> / 10</span>
            </div>
            <div className="p-6" style={{ backgroundColor: 'var(--bg-card)' }}>
              <span className="section-label" style={{ marginBottom: '6px' }}>NPS Score</span>
              <span className={`text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${nps.npsScore >= 0 ? 'text-[color:var(--status-success-text)]' : 'text-[color:var(--status-error-text)]'}`}>
                {nps.npsScore > 0 ? '+' : ''}{nps.npsScore}
              </span>
            </div>
          </div>
          {/* Distribution bar */}
          <div className="flex h-3 rounded-full overflow-hidden mt-4">
            <div style={{ width: `${nps.detractorPercentage}%`, backgroundColor: 'var(--status-error)' }} />
            <div style={{ width: `${nps.passivePercentage}%`, backgroundColor: 'var(--status-warning)' }} />
            <div style={{ width: `${nps.promoterPercentage}%`, backgroundColor: 'var(--status-success)' }} />
          </div>
          <div className="flex justify-between text-xs text-[color:var(--text-tertiary)] mt-2 tabular-nums">
            <span>Detractors ({nps.detractorPercentage.toFixed(0)}%)</span>
            <span>Passives ({nps.passivePercentage.toFixed(0)}%)</span>
            <span>Promoters ({nps.promoterPercentage.toFixed(0)}%)</span>
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="glass-input text-sm"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setCursor(null);
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className="glass-input text-sm"
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value);
            setCursor(null);
          }}
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="glass-input text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCursor(null);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 border-[color:var(--status-error)]">
          <p className="text-sm text-[color:var(--status-error-text)]">Failed to load feedback: {error.message}</p>
        </div>
      )}

      {/* Table */}
      <div className="card-flush overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] text-left">
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && feedbacks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                  Loading...
                </td>
              </tr>
            ) : feedbacks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                  No feedback found
                </td>
              </tr>
            ) : (
              feedbacks.map((fb) => (
                <tr
                  key={fb.id}
                  onClick={() => setSelectedFeedback(fb)}
                  className="border-b border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-muted)] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-[color:var(--text-primary)] font-mono text-xs">
                    {fb.tenantId.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-primary)] font-mono text-xs">
                    {fb.userId.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[color:var(--text-primary)]">
                      {categoryLabels[fb.category] ?? fb.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full border ${severityColors[fb.severity] ?? ''}`}
                    >
                      {fb.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)] max-w-xs">
                    {truncate(fb.description, 100)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full border ${statusColors[fb.status] ?? ''}`}
                    >
                      {fb.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)] text-xs whitespace-nowrap">
                    {formatDateTime(fb.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageInfo && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--text-tertiary)]">
            {connection?.totalCount != null
              ? `${connection.totalCount} feedback item${connection.totalCount === 1 ? '' : 's'}`
              : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(null)}
              disabled={!pageInfo.hasPreviousPage}
              className="glass-button text-xs disabled:opacity-30"
            >
              First
            </button>
            <button
              onClick={() => setCursor(pageInfo.endCursor)}
              disabled={!pageInfo.hasNextPage}
              className="glass-button text-xs disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        open={!!selectedFeedback}
        onClose={() => setSelectedFeedback(null)}
        title="Feedback Detail"
        size="lg"
      >
        {selectedFeedback && (
          <div className="space-y-4">
            {/* Meta info row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1">Category</span>
                <span className="text-[color:var(--text-primary)]">
                  {categoryLabels[selectedFeedback.category] ?? selectedFeedback.category}
                </span>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1">Severity</span>
                <span
                  className={`inline-block px-2 py-0.5 text-xs rounded-full border ${severityColors[selectedFeedback.severity] ?? ''}`}
                >
                  {selectedFeedback.severity}
                </span>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1">Tenant ID</span>
                <span className="text-[color:var(--text-primary)] font-mono text-xs">
                  {selectedFeedback.tenantId}
                </span>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1">User ID</span>
                <span className="text-[color:var(--text-primary)] font-mono text-xs">
                  {selectedFeedback.userId}
                </span>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1">Submitted</span>
                <span className="text-[color:var(--text-primary)] text-xs">
                  {formatDateTime(selectedFeedback.createdAt)}
                </span>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1">Last Updated</span>
                <span className="text-[color:var(--text-primary)] text-xs">
                  {formatDateTime(selectedFeedback.updatedAt)}
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <span className="text-[color:var(--text-tertiary)] block mb-1 text-sm">Description</span>
              <p className="text-[color:var(--text-primary)] text-sm whitespace-pre-wrap card p-3">
                {selectedFeedback.description}
              </p>
            </div>

            {/* Screenshot URL */}
            {selectedFeedback.screenshotUrl && (
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1 text-sm">Screenshot URL</span>
                <a
                  href={selectedFeedback.screenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--status-info-text)] hover:opacity-80 text-sm underline break-all"
                >
                  {selectedFeedback.screenshotUrl}
                </a>
              </div>
            )}

            {/* Page URL */}
            {selectedFeedback.pageUrl && (
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1 text-sm">Page URL</span>
                <span className="text-[color:var(--text-secondary)] text-sm font-mono break-all">
                  {selectedFeedback.pageUrl}
                </span>
              </div>
            )}

            {/* Debug Context */}
            {selectedFeedback.debugContext && (
              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1 text-sm">Debug Context</span>
                <pre className="card p-3 text-xs text-[color:var(--text-secondary)] overflow-x-auto">
                  {JSON.stringify(selectedFeedback.debugContext, null, 2)}
                </pre>
              </div>
            )}

            {/* Status Update */}
            <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
              <span className="text-[color:var(--text-tertiary)] text-sm">Update Status:</span>
              <select
                className="glass-input text-sm"
                value={selectedFeedback.status}
                disabled={updating}
                onChange={(e) => handleStatusUpdate(selectedFeedback.id, e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {updating && <span className="text-[color:var(--text-tertiary)] text-xs">Updating...</span>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
