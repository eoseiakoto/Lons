'use client';

import { useMemo } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';

const SCREENINGS_FOR_REVIEW = gql`
  query ScreeningsForReview($first: Int) {
    screeningsForReview(first: $first) {
      screeningId
      customerId
      customer {
        id
        fullName
        phonePrimary
        externalId
        country
        kycLevel
        status
      }
      screenedAt
      riskLevel
      matches {
        matchId
        matchType
        entityName
        matchScore
        source
      }
      provider
      status
    }
  }
`;

const SUBMIT_SCREENING_REVIEW = gql`
  mutation SubmitScreeningReview($screeningId: ID!, $decision: String!, $reason: String) {
    submitScreeningReview(screeningId: $screeningId, decision: $decision, reason: $reason) {
      screeningId
      reviewDecision
      reviewedAt
    }
  }
`;

interface ScreeningMatch {
  matchId: string;
  matchType: string;
  entityName: string;
  matchScore: number;
  source: string;
}

interface ScreeningCustomer {
  id: string;
  fullName?: string;
  phonePrimary?: string;
  externalId?: string;
  country?: string;
  kycLevel?: string;
  status?: string;
}

interface ScreeningRow {
  screeningId: string;
  customerId: string;
  customer?: ScreeningCustomer;
  screenedAt: string;
  riskLevel: string;
  matches: ScreeningMatch[];
  provider: string;
  status: string;
}

function matchTypeBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    SANCTIONS: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]',
    PEP: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]',
    ADVERSE_MEDIA: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]',
    WATCHLIST: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)]',
  };
  return colors[type] || 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)]';
}

function riskLevelBadge(level: string) {
  const colors: Record<string, string> = {
    MEDIUM: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]',
    HIGH: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]',
    CRITICAL: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]',
  };
  const bg = colors[level] || 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)]';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${bg}`}>
      {level}
    </span>
  );
}

export default function ScreeningPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { data, loading, refetch } = useQuery(SCREENINGS_FOR_REVIEW, {
    variables: { first: 50 },
  });

  const [submitReview, { loading: submitting }] = useMutation(SUBMIT_SCREENING_REVIEW);

  const screenings: ScreeningRow[] = data?.screeningsForReview || [];

  const stats = useMemo(() => {
    const critical = screenings.filter((s) => s.riskLevel === 'CRITICAL').length;
    const high = screenings.filter((s) => s.riskLevel === 'HIGH').length;
    const matches = screenings.filter((s) => s.status === 'MATCH' || s.status === 'POTENTIAL_MATCH').length;
    return { critical, high, matches };
  }, [screenings]);

  const handleReview = async (screeningId: string, decision: string) => {
    const confirmed = window.confirm(
      t('screening.confirm', { action: decision.toLowerCase() })
    );
    if (!confirmed) return;

    try {
      await submitReview({
        variables: { screeningId, decision },
      });
      refetch();
    } catch (err: any) {
      const message = err?.graphQLErrors?.[0]?.message || t('screening.submitError');
      alert(message);
    }
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.amlReviewQueue')}
        title={t('screening.queueTitle')}
        subtitle={t('screening.subtitle')}
      />

      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title={t('screening.metric.awaitingReview')}
          value={loading ? '—' : screenings.length}
          subtitle={t('screening.metric.awaitingReviewSub')}
          icon={<Shield className="w-4 h-4" />}
          live={screenings.length > 0}
        />
        <MetricCard
          variant="glow"
          title={t('screening.metric.matches')}
          value={loading ? '—' : stats.matches}
          subtitle={t('screening.metric.matchesSub')}
          icon={<AlertTriangle className="w-4 h-4" />}
          live={stats.matches > 0}
        />
        <MetricCard
          variant="glow"
          title={t('screening.metric.criticalRisk')}
          value={loading ? '—' : stats.critical}
          subtitle={t('screening.metric.criticalRiskSub')}
          icon={<ShieldAlert className="w-4 h-4" />}
          live={stats.critical > 0}
        />
        <MetricCard
          variant="glow"
          title={t('screening.metric.highRisk')}
          value={loading ? '—' : stats.high}
          subtitle={t('screening.metric.highRiskSub')}
          icon={<ShieldCheck className="w-4 h-4" />}
        />
      </section>

      {loading ? (
        <div className="relative z-10 text-sm text-[color:var(--text-tertiary)] py-12 text-center card-glow">
          {t('common.loading')}
        </div>
      ) : (
        <div className="relative z-10 card-glow overflow-hidden">
          <DataTable
            columns={[
              {
                header: t('screening.columns.customer'),
                accessor: (r: ScreeningRow) => (
                  <div>
                    <div className="text-sm text-[color:var(--text-primary)] font-medium">
                      {r.customer?.fullName || t('screening.detail.unknown')}
                    </div>
                    {r.customer?.phonePrimary && (
                      <div className="text-xs text-[color:var(--text-tertiary)]">{r.customer.phonePrimary}</div>
                    )}
                  </div>
                ),
              },
              {
                header: t('screening.columns.screened'),
                accessor: (r: ScreeningRow) => formatDate(r.screenedAt),
              },
              {
                header: t('screening.columns.riskLevel'),
                accessor: (r: ScreeningRow) => riskLevelBadge(r.riskLevel),
              },
              {
                header: t('screening.columns.matchDetails'),
                accessor: (r: ScreeningRow) => (
                  <div className="space-y-1">
                    {r.matches.map((m, i) => (
                      <div key={m.matchId || i} className="flex items-center gap-2">
                        <span className={`pill text-[10px] ${matchTypeBadgeColor(m.matchType)}`}>
                          {m.matchType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-[color:var(--text-secondary)] truncate max-w-[140px]" title={m.entityName}>
                          {m.entityName}
                        </span>
                        <span className="text-xs text-[color:var(--text-tertiary)]">
                          {m.matchScore}%
                        </span>
                      </div>
                    ))}
                    {r.matches.length === 0 && (
                      <span className="text-xs text-[color:var(--text-tertiary)]">{t('screening.detail.noMatches')}</span>
                    )}
                  </div>
                ),
              },
              {
                header: t('screening.columns.provider'),
                accessor: 'provider' as keyof ScreeningRow,
              },
              {
                header: t('screening.columns.status'),
                accessor: (r: ScreeningRow) => <StatusBadge status={r.status} />,
              },
              {
                header: t('screening.columns.actions'),
                accessor: (r: ScreeningRow) => (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={submitting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReview(r.screeningId, 'APPROVE');
                      }}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] hover:opacity-80 transition-colors disabled:opacity-50"
                    >
                      {t('screening.actions.approve')}
                    </button>
                    <button
                      disabled={submitting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReview(r.screeningId, 'BLOCK');
                      }}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] hover:opacity-80 transition-colors disabled:opacity-50"
                    >
                      {t('screening.actions.block')}
                    </button>
                    <button
                      disabled={submitting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReview(r.screeningId, 'ESCALATE');
                      }}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] hover:opacity-80 transition-colors disabled:opacity-50"
                    >
                      {t('screening.actions.escalate')}
                    </button>
                  </div>
                ),
              },
            ]}
            data={screenings}
            onRowClick={(r: ScreeningRow) => router.push(`/screening/${r.screeningId}`)}
            emptyMessage={t('screening.noPendingReview')}
          />
        </div>
      )}
    </div>
  );
}
