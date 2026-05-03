'use client';

import { useState, useCallback, useMemo } from 'react';
import { gql, useQuery, useMutation, useApolloClient } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  MessageSquare,
  Heart,
  Filter,
  Star,
  Bug,
  Lightbulb,
  HelpCircle,
  Building2,
  Calendar,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';
import { SlideOver } from '@/components/ui/slide-over';
import { Gauge } from '@/components/ui/gauge';

// ─── GraphQL ────────────────────────────────────────────────────────────────

const GET_FEEDBACKS = gql`
  query GetFeedbacks(
    $status: FeedbackStatus
    $category: FeedbackCategory
    $severity: FeedbackSeverity
    $dateFrom: String
    $dateTo: String
    $first: Int
    $after: String
  ) {
    feedbacks(
      status: $status
      category: $category
      severity: $severity
      dateFrom: $dateFrom
      dateTo: $dateTo
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
          tenant { id name }
          user { id email name }
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

const SURVEY_RESPONSES = gql`
  query SurveyResponses {
    surveyResponses(first: 200) {
      id
      score
      comment
      createdAt
      tenant { id name }
      user { id name email }
    }
  }
`;

// ─── Constants ──────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','it','this','that','was','are','be','have','has','had','do','does','did','will','would','could','should','may','can','not','no','so','if','as','its','my','i','we','you','they','he','she','very','just','also','more','some','any','all','been','being','from','about','into','than','too','much','really','quite','there','here','when','what','how','which','who','where','why','am','were','get','got','like',
]);

function extractKeywords(comments: string[]): { word: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const comment of comments) {
    const words = comment
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    for (const word of words) freq[word] = (freq[word] || 0) + 1;
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

const CATEGORIES = [
  { value: '', label: 'Any category' },
  { value: 'BUG', label: 'Bug' },
  { value: 'FEATURE_REQUEST', label: 'Feature request' },
  { value: 'UX_ISSUE', label: 'UX issue' },
  { value: 'INTEGRATION_QUESTION', label: 'Integration question' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITIES = [
  { value: '', label: 'Any severity' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
  { value: 'SUGGESTION', label: 'Suggestion' },
];

const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'NEW', label: 'New' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_OPTIONS = STATUSES.filter((s) => s.value !== '');

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--status-error)',
  MAJOR: 'var(--status-warning)',
  MINOR: 'var(--status-warning)',
  SUGGESTION: 'var(--accent-primary)',
};

const STATUS_COLOR: Record<string, string> = {
  NEW: 'var(--status-info)',
  ACKNOWLEDGED: 'var(--status-info)',
  IN_PROGRESS: 'var(--status-warning)',
  RESOLVED: 'var(--status-success)',
  CLOSED: 'var(--text-tertiary)',
};

const CATEGORY_LABEL: Record<string, string> = {
  BUG: 'Bug',
  FEATURE_REQUEST: 'Feature request',
  UX_ISSUE: 'UX issue',
  INTEGRATION_QUESTION: 'Integration question',
  OTHER: 'Other',
};

const CATEGORY_ICON: Record<string, typeof Bug> = {
  BUG: Bug,
  FEATURE_REQUEST: Lightbulb,
  UX_ISSUE: HelpCircle,
  INTEGRATION_QUESTION: HelpCircle,
  OTHER: MessageSquare,
};

interface SurveyNode {
  id: string;
  score: number;
  comment?: string;
  createdAt: string;
  tenant?: { id: string; name: string };
  user?: { id: string; name: string; email: string };
}

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
  tenant?: { id: string; name: string };
  user?: { id: string; email: string; name: string };
}

const PAGE_SIZE = 20;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackNode | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const client = useApolloClient();

  const { data: npsData } = useQuery(NPS_SUMMARY);
  const nps = npsData?.npsSummary;

  const { data: surveyData } = useQuery(SURVEY_RESPONSES, { fetchPolicy: 'cache-and-network' });
  const surveyResponses: SurveyNode[] = surveyData?.surveyResponses || [];

  const keywords = useMemo(() => {
    const comments = surveyResponses
      .map((r) => r.comment)
      .filter((c): c is string => !!c && c.trim().length > 0);
    return extractKeywords(comments);
  }, [surveyResponses]);

  const maxKeywordCount = keywords.length > 0 ? keywords[0].count : 1;

  const filterVars = {
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    severity: severityFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data, loading, error, refetch } = useQuery(GET_FEEDBACKS, {
    variables: { ...filterVars, first: PAGE_SIZE, after: cursor },
    fetchPolicy: 'cache-and-network',
  });

  const [updateStatus, { loading: updating }] = useMutation(UPDATE_FEEDBACK_STATUS);

  const connection = data?.feedbacks;
  const feedbacks: FeedbackNode[] = (connection?.edges || []).map((e: any) => e.node);
  const pageInfo = connection?.pageInfo;
  const totalCount = connection?.totalCount ?? 0;

  const avgScore =
    nps && nps.totalResponses > 0
      ? (nps.promoters * 9.5 + nps.passives * 7.5 + nps.detractors * 3) / nps.totalResponses
      : 0;

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await updateStatus({ variables: { id, status: newStatus } });
      setStatusMsg({
        type: 'success',
        text: `Status updated to ${newStatus.replace(/_/g, ' ')}`,
      });
      if (selectedFeedback?.id === id) {
        setSelectedFeedback((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      refetch();
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Failed: ${err.message ?? 'Unknown error'}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + '…' : text;

  const escapeCsv = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const [feedbackResult, surveyResult] = await Promise.all([
        client.query({
          query: GET_FEEDBACKS,
          variables: { ...filterVars, first: 5000 },
          fetchPolicy: 'network-only',
        }),
        client.query({ query: SURVEY_RESPONSES, fetchPolicy: 'network-only' }),
      ]);
      const feedbackRows: FeedbackNode[] =
        (feedbackResult.data?.feedbacks?.edges || []).map((e: any) => e.node);
      const surveyRows: SurveyNode[] = surveyResult.data?.surveyResponses || [];

      if (feedbackRows.length === 0 && surveyRows.length === 0) {
        setStatusMsg({ type: 'error', text: 'No data to export' });
        setTimeout(() => setStatusMsg(null), 3000);
        return;
      }

      const sheets: string[] = [];
      let totalRows = 0;
      if (feedbackRows.length > 0) {
        const fbHeaders = ['Type','Tenant','User','User Email','Category','Severity','Status','Description','Page URL','Screenshot URL','Submitted','Last Updated'];
        const fbRows = feedbackRows.map((fb) =>
          [
            escapeCsv('Feedback'),
            escapeCsv(fb.tenant?.name ?? fb.tenantId),
            escapeCsv(fb.user?.name ?? '—'),
            escapeCsv(fb.user?.email ?? ''),
            escapeCsv(CATEGORY_LABEL[fb.category] ?? fb.category),
            escapeCsv(fb.severity),
            escapeCsv(fb.status.replace(/_/g, ' ')),
            escapeCsv(fb.description),
            escapeCsv(fb.pageUrl ?? ''),
            escapeCsv(fb.screenshotUrl ?? ''),
            escapeCsv(formatDateTime(fb.createdAt)),
            escapeCsv(formatDateTime(fb.updatedAt)),
          ].join(','),
        );
        sheets.push(fbHeaders.join(','), ...fbRows);
        totalRows += feedbackRows.length;
      }
      if (surveyRows.length > 0) {
        if (sheets.length > 0) sheets.push('');
        const npsHeaders = ['Type','Tenant','User','User Email','NPS Score','NPS Category','Comment','Submitted'];
        const npsRows = surveyRows.map((r) => {
          const cat = r.score >= 9 ? 'Promoter' : r.score >= 7 ? 'Passive' : 'Detractor';
          return [
            escapeCsv('NPS Survey'),
            escapeCsv(r.tenant?.name ?? '—'),
            escapeCsv(r.user?.name ?? '—'),
            escapeCsv(r.user?.email ?? ''),
            String(r.score),
            escapeCsv(cat),
            escapeCsv(r.comment ?? ''),
            escapeCsv(formatDateTime(r.createdAt)),
          ].join(',');
        });
        sheets.push(npsHeaders.join(','), ...npsRows);
        totalRows += surveyRows.length;
      }
      const csv = sheets.join('\n');
      downloadCsv(csv, `feedback-export-${new Date().toISOString().slice(0, 10)}.csv`);
      setStatusMsg({
        type: 'success',
        text: `Exported ${totalRows} items (${feedbackRows.length} feedback, ${surveyRows.length} survey responses)`,
      });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Export failed: ${err.message ?? 'Unknown error'}` });
      setTimeout(() => setStatusMsg(null), 5000);
    } finally {
      setExporting(false);
    }
  }, [client, filterVars]);

  const filtersActive = Boolean(
    categoryFilter || severityFilter || statusFilter || dateFrom || dateTo,
  );

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow="Live · Voice of customer"
        title="Feedback"
        subtitle="User feedback and NPS scores from every tenant."
        actions={
          <button onClick={exportCsv} disabled={exporting} className="btn-secondary disabled:opacity-50">
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />

      {/* Status toast */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative z-10 card-glow px-4 py-2.5 text-sm flex items-center gap-2"
            style={{
              color:
                statusMsg.type === 'success'
                  ? 'var(--status-success-text)'
                  : 'var(--status-error-text)',
            }}
          >
            {statusMsg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* NPS hero row */}
      {nps && nps.totalResponses > 0 && (
        <section className="relative z-10 grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-5 card-glow-hero card-glow-sweep p-6 lg:p-7 flex flex-col justify-between min-h-[220px]">
            <div className="flex items-center gap-3 mb-2">
              <Heart className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--accent-primary-deep)]">
                Net Promoter Score
              </span>
            </div>
            <div className="flex items-end gap-4">
              <span
                className="font-semibold tabular-nums leading-none"
                style={{
                  fontSize: 64,
                  letterSpacing: '-0.038em',
                  color:
                    nps.npsScore >= 0
                      ? 'var(--accent-primary-deep)'
                      : 'var(--status-error-text)',
                  textShadow:
                    nps.npsScore >= 0
                      ? '0 0 32px rgba(var(--accent-primary-rgb), 0.40)'
                      : '0 0 32px rgba(255, 80, 96, 0.30)',
                }}
              >
                {nps.npsScore > 0 ? '+' : ''}
                {nps.npsScore}
              </span>
              <span className="text-[14px] text-[color:var(--text-secondary)] pb-2">
                from {nps.totalResponses} response{nps.totalResponses === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-2">
              <div
                className="flex h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${nps.detractorPercentage}%` }}
                  transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
                  style={{
                    backgroundColor: 'var(--status-error)',
                    boxShadow: '0 0 8px rgba(255, 80, 96, 0.4)',
                  }}
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${nps.passivePercentage}%` }}
                  transition={{ duration: 0.9, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
                  style={{ backgroundColor: 'var(--status-warning)' }}
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${nps.promoterPercentage}%` }}
                  transition={{ duration: 0.9, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  style={{
                    backgroundColor: 'var(--status-success)',
                    boxShadow: '0 0 8px rgba(110, 233, 154, 0.4)',
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] tabular-nums">
                <span>Detractors {nps.detractorPercentage.toFixed(0)}%</span>
                <span>Passives {nps.passivePercentage.toFixed(0)}%</span>
                <span>Promoters {nps.promoterPercentage.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-3 card-glow p-6 flex flex-col items-center justify-between text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-tertiary)]">
              Avg score
            </p>
            <Gauge value={avgScore} max={10} size={140} sublabel="of 10" />
            <span className="text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
              {nps.totalResponses} ratings
            </span>
          </div>

          <div className="col-span-12 md:col-span-4 grid grid-cols-1 gap-3">
            <MetricCard
              variant="glow"
              title="Promoters"
              value={nps.promoters}
              subtitle={`Score 9–10 · ${nps.promoterPercentage.toFixed(0)}%`}
              icon={<Star className="w-4 h-4" />}
            />
            <MetricCard
              variant="glow"
              title="Detractors"
              value={nps.detractors}
              subtitle={`Score 0–6 · ${nps.detractorPercentage.toFixed(0)}%`}
              icon={<Heart className="w-4 h-4" />}
              live={nps.detractors > 0}
            />
          </div>
        </section>
      )}

      {/* Keywords + survey */}
      {surveyResponses.length > 0 && (
        <section className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {keywords.length > 0 && (
            <div className="card-glow p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  Top keywords
                </h2>
                <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                  {keywords.length} terms
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map(({ word, count }) => {
                  const ratio = count / maxKeywordCount;
                  const fontSize =
                    ratio > 0.75 ? 18 : ratio > 0.5 ? 16 : ratio > 0.25 ? 14 : 12;
                  const color =
                    ratio > 0.5
                      ? 'var(--text-primary)'
                      : ratio > 0.25
                        ? 'var(--text-secondary)'
                        : 'var(--text-tertiary)';
                  const bg =
                    ratio > 0.75
                      ? 'var(--accent-primary-soft)'
                      : 'var(--bg-muted)';
                  return (
                    <span
                      key={word}
                      className="rounded-full px-3 py-1 transition-colors cursor-default whitespace-nowrap"
                      title={`${word}: ${count} mention${count > 1 ? 's' : ''}`}
                      style={{
                        fontSize,
                        color: ratio > 0.75 ? 'var(--accent-primary-deep)' : color,
                        backgroundColor: bg,
                        border: `1px solid ${ratio > 0.75 ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {word}
                      <span className="text-[10px] text-[color:var(--text-tertiary)] ml-1.5 tabular-nums">
                        {count}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card-glow p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                Survey responses
              </h2>
              <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                {surveyResponses.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {surveyResponses.map((r) => {
                const tone =
                  r.score >= 9
                    ? 'var(--status-success)'
                    : r.score >= 7
                      ? 'var(--status-warning)'
                      : 'var(--status-error)';
                return (
                  <div
                    key={r.id}
                    className="rounded-lg p-3 space-y-1.5"
                    style={{
                      backgroundColor: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold tabular-nums flex-shrink-0"
                          style={{
                            backgroundColor: `${tone}1A`,
                            color: tone,
                            border: `1px solid ${tone}40`,
                          }}
                        >
                          {r.score}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] text-[color:var(--text-primary)] truncate">
                            {r.user?.name ?? '—'}
                          </div>
                          <div className="text-[11px] text-[color:var(--text-tertiary)] truncate">
                            {r.tenant?.name}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums whitespace-nowrap">
                        {formatDateTime(r.createdAt)}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="text-[13px] text-[color:var(--text-secondary)] pl-9 leading-relaxed">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">Filter</span>
        </div>
        <FilterPill
          options={CATEGORIES}
          value={categoryFilter}
          onChange={(v) => {
            setCategoryFilter(v);
            setCursor(null);
          }}
        />
        <FilterPill
          options={SEVERITIES}
          value={severityFilter}
          onChange={(v) => {
            setSeverityFilter(v);
            setCursor(null);
          }}
        />
        <FilterPill
          options={STATUSES}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setCursor(null);
          }}
        />
        <div className="flex items-center gap-1.5 ml-1">
          <Calendar className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setCursor(null);
            }}
            className="rounded-lg px-2 py-1 text-[12px] focus:outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="text-[11px] text-[color:var(--text-tertiary)]">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setCursor(null);
            }}
            className="rounded-lg px-2 py-1 text-[12px] focus:outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        {filtersActive && (
          <button
            onClick={() => {
              setCategoryFilter('');
              setSeverityFilter('');
              setStatusFilter('');
              setDateFrom('');
              setDateTo('');
              setCursor(null);
            }}
            className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {totalCount} item{totalCount === 1 ? '' : 's'}
        </span>
      </section>

      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm relative z-10"
          style={{
            backgroundColor: 'var(--status-error-soft)',
            color: 'var(--status-error-text)',
            border: '1px solid var(--status-error)',
          }}
        >
          Failed to load feedback: {error.message}
        </div>
      )}

      {/* Table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>Tenant</Th>
                <Th>User</Th>
                <Th>Category</Th>
                <Th>Severity</Th>
                <Th>Description</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {loading && feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    Loading…
                  </td>
                </tr>
              ) : feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <MessageSquare className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {filtersActive ? 'No feedback matches these filters.' : 'No feedback yet.'}
                    </p>
                  </td>
                </tr>
              ) : (
                feedbacks.map((fb, i) => {
                  const sevColor = SEVERITY_COLOR[fb.severity] ?? 'var(--text-tertiary)';
                  const statColor = STATUS_COLOR[fb.status] ?? 'var(--text-tertiary)';
                  const Icon = CATEGORY_ICON[fb.category] ?? MessageSquare;
                  return (
                    <tr
                      key={fb.id}
                      onClick={() => setSelectedFeedback(fb)}
                      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] flex-shrink-0" />
                          <span className="text-[color:var(--text-primary)]">
                            {fb.tenant?.name ?? fb.tenantId.slice(0, 8) + '…'}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <span className="block text-[color:var(--text-primary)]">
                            {fb.user?.name ?? '—'}
                          </span>
                          {fb.user?.email && (
                            <span className="text-[11px] text-[color:var(--text-tertiary)]">
                              {fb.user.email}
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 text-[color:var(--text-primary)]">
                          <Icon className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                          {CATEGORY_LABEL[fb.category] ?? fb.category}
                        </span>
                      </Td>
                      <Td>
                        <Pill color={sevColor}>{fb.severity}</Pill>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-secondary)] block max-w-md">
                          {truncate(fb.description, 100)}
                        </span>
                      </Td>
                      <Td>
                        <Pill color={statColor}>{fb.status.replace(/_/g, ' ')}</Pill>
                      </Td>
                      <Td>
                        <span className="text-[12px] text-[color:var(--text-tertiary)] tabular-nums whitespace-nowrap">
                          {formatDateTime(fb.createdAt)}
                        </span>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pagination */}
      {pageInfo && feedbacks.length > 0 && (
        <div className="relative z-10 flex items-center justify-between text-sm">
          <span className="text-[color:var(--text-tertiary)] tabular-nums">
            {totalCount} feedback item{totalCount === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(null)}
              disabled={!pageInfo.hasPreviousPage}
              className="btn-ghost text-xs disabled:opacity-30"
            >
              First
            </button>
            <button
              onClick={() => setCursor(pageInfo.endCursor)}
              disabled={!pageInfo.hasNextPage}
              className="btn-secondary text-xs disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail slide-over */}
      <AnimatePresence>
        {selectedFeedback && (
          <SlideOver
            title="Feedback detail"
            subtitle={selectedFeedback.tenant?.name}
            onClose={() => setSelectedFeedback(null)}
          >
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Meta
                  label="Category"
                  value={CATEGORY_LABEL[selectedFeedback.category] ?? selectedFeedback.category}
                />
                <Meta
                  label="Severity"
                  value={
                    <Pill color={SEVERITY_COLOR[selectedFeedback.severity] ?? 'var(--text-tertiary)'}>
                      {selectedFeedback.severity}
                    </Pill>
                  }
                />
                <Meta
                  label="Tenant"
                  value={selectedFeedback.tenant?.name ?? selectedFeedback.tenantId}
                />
                <Meta
                  label="User"
                  value={
                    <>
                      <span>{selectedFeedback.user?.name ?? '—'}</span>
                      {selectedFeedback.user?.email && (
                        <span className="block text-[11px] text-[color:var(--text-tertiary)]">
                          {selectedFeedback.user.email}
                        </span>
                      )}
                    </>
                  }
                />
                <Meta label="Submitted" value={formatDateTime(selectedFeedback.createdAt)} />
                <Meta label="Last updated" value={formatDateTime(selectedFeedback.updatedAt)} />
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-2">
                  Description
                </span>
                <p
                  className="text-[14px] text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap p-4 rounded-lg"
                  style={{
                    backgroundColor: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {selectedFeedback.description}
                </p>
              </div>

              {selectedFeedback.screenshotUrl && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-1.5">
                    Screenshot
                  </span>
                  <a
                    href={selectedFeedback.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--accent-primary-deep)] hover:opacity-80 text-sm underline break-all"
                  >
                    {selectedFeedback.screenshotUrl}
                  </a>
                </div>
              )}

              {selectedFeedback.pageUrl && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-1.5">
                    Page URL
                  </span>
                  <span className="text-[color:var(--text-secondary)] text-[12px] font-mono break-all">
                    {selectedFeedback.pageUrl}
                  </span>
                </div>
              )}

              {selectedFeedback.debugContext && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-1.5">
                    Debug context
                  </span>
                  <pre
                    className="p-3 text-[11px] text-[color:var(--text-secondary)] overflow-x-auto rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {JSON.stringify(selectedFeedback.debugContext, null, 2)}
                  </pre>
                </div>
              )}

              <div
                className="flex items-center gap-3 pt-4"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                  Update status
                </span>
                <select
                  className="input-field flex-1"
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
                {updating && (
                  <span className="text-[color:var(--text-tertiary)] text-xs">Updating…</span>
                )}
              </div>
            </div>
          </SlideOver>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}
function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
      style={{
        backgroundColor: `${color}1A`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {children}
    </span>
  );
}
function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-1">
        {label}
      </span>
      <span className="text-[14px] text-[color:var(--text-primary)]">{value}</span>
    </div>
  );
}
