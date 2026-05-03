'use client';

import { gql, useQuery, useMutation } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatDateTime } from '@/lib/utils';
import { countryName } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/i18n-context';

const SCREENING_DETAIL = gql`
  query ScreeningById($screeningId: ID!) {
    screeningById(screeningId: $screeningId) {
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
        details
      }
      provider
      status
      reviewedBy
      reviewedAt
      reviewDecision
    }
  }
`;

const CUSTOMER_SCREENINGS = gql`
  query CustomerScreenings($customerId: ID!, $first: Int) {
    customerScreenings(customerId: $customerId, first: $first) {
      screeningId
      status
      riskLevel
      screenedAt
      provider
      reviewDecision
      reviewedAt
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
    LOW: 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)]',
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

export default function ScreeningDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [reason, setReason] = useState('');

  const { data, loading } = useQuery(SCREENING_DETAIL, {
    variables: { screeningId: id },
  });

  const screening = data?.screeningById;

  // Fetch screening history for this customer
  const { data: historyData } = useQuery(CUSTOMER_SCREENINGS, {
    variables: { customerId: screening?.customerId, first: 10 },
    skip: !screening?.customerId,
  });

  const [submitReview, { loading: submitting }] = useMutation(SUBMIT_SCREENING_REVIEW);

  const handleReview = async (decision: string) => {
    const confirmed = window.confirm(
      t('screening.confirm', { action: decision.toLowerCase() })
    );
    if (!confirmed) return;

    try {
      await submitReview({
        variables: { screeningId: id, decision, reason: reason || undefined },
      });
      router.push('/screening');
    } catch (err: any) {
      const message = err?.graphQLErrors?.[0]?.message || t('screening.submitError');
      alert(message);
    }
  };

  if (loading) {
    return <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>;
  }

  if (!screening) {
    return (
      <div className="space-y-4 animate-enter">
        <button onClick={() => router.push('/screening')} className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('screening.backToQueue')}
        </button>
        <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('screening.notFound')}</div>
      </div>
    );
  }

  const customer = screening.customer;
  const matches = screening.matches || [];
  const history = historyData?.customerScreenings || [];

  return (
    <div className="relative space-y-8 animate-enter">
      <button
        onClick={() => router.push('/screening')}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t('screening.backToQueue')}
      </button>

      <section className="relative z-10 card-glow-hero card-glow-sweep p-7 lg:p-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="live-dot" aria-hidden />
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
                {t('screening.detail.amlReviewEyebrow')}{screening.provider}
              </span>
            </div>
            <h1
              className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
              style={{ fontSize: 32, lineHeight: 1.05 }}
            >
              {t('screening.reviewTitle')}
            </h1>
            <p className="text-[13px] text-[color:var(--text-tertiary)] mt-2 tabular-nums">
              {formatDateTime(screening.screenedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {riskLevelBadge(screening.riskLevel)}
            <StatusBadge status={screening.status} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Customer + History */}
        <div className="lg:col-span-1 space-y-6">
          {/* Customer Card */}
          <div className="card-glow p-6 space-y-4">
            <h2 className="section-label">{t('screening.detail.customerSection')}</h2>
            <div className="space-y-2">
              <div>
                <div className="text-sm text-[color:var(--text-primary)] font-medium">{customer?.fullName || t('screening.detail.unknown')}</div>
                {customer?.phonePrimary && (
                  <div className="text-xs text-[color:var(--text-tertiary)]">{customer.phonePrimary}</div>
                )}
              </div>
              {customer?.externalId && (
                <div className="flex justify-between text-xs">
                  <span className="text-[color:var(--text-tertiary)]">{t('screening.detail.externalId')}</span>
                  <span className="text-[color:var(--text-primary)] font-mono">{customer.externalId}</span>
                </div>
              )}
              {customer?.country && (
                <div className="flex justify-between text-xs">
                  <span className="text-[color:var(--text-tertiary)]">{t('screening.detail.country')}</span>
                  <span className="text-[color:var(--text-primary)]">{countryName(customer.country)}</span>
                </div>
              )}
              {customer?.kycLevel && (
                <div className="flex justify-between text-xs">
                  <span className="text-[color:var(--text-tertiary)]">{t('screening.detail.kycLevel')}</span>
                  <span className="text-[color:var(--text-primary)] capitalize">{customer.kycLevel.replace(/_/g, ' ')}</span>
                </div>
              )}
              {customer?.status && (
                <div className="flex justify-between text-xs">
                  <span className="text-[color:var(--text-tertiary)]">{t('common.status')}</span>
                  <StatusBadge status={customer.status} />
                </div>
              )}
            </div>
            {customer?.id && (
              <button
                onClick={() => router.push(`/customers/${customer.id}`)}
                className="w-full mt-2 px-3 py-1.5 rounded text-xs font-medium text-[color:var(--accent-primary-deep)] bg-[color:var(--accent-primary-soft)] hover:bg-[color:var(--accent-primary-soft)] transition-colors"
              >
                {t('screening.detail.viewProfile')}
              </button>
            )}
          </div>

          {/* Screening History */}
          {history.length > 1 && (
            <div className="card-glow p-6 space-y-4">
              <h2 className="section-label">{t('screening.detail.historySection')}</h2>
              <div className="space-y-2">
                {history.map((h: any) => (
                  <div
                    key={h.screeningId}
                    className={`flex items-center justify-between text-xs p-2 rounded ${h.screeningId === id ? 'bg-[color:var(--bg-muted)] border border-[color:var(--border-subtle)]' : ''}`}
                  >
                    <div>
                      <div className="text-[color:var(--text-primary)]">{formatDate(h.screenedAt)}</div>
                      <div className="text-[color:var(--text-tertiary)]">{h.provider}</div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={h.reviewDecision || h.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Match Details + Review */}
        <div className="lg:col-span-2 space-y-6">
          {/* Match Details */}
          <div className="card-glow p-6 space-y-4">
            <h2 className="section-label">
              {t('screening.detail.matchSection')} ({matches.length})
            </h2>

            {matches.length === 0 ? (
              <div className="text-sm text-[color:var(--text-tertiary)]">{t('screening.noMatchesRecorded')}</div>
            ) : (
              <div className="space-y-3">
                {matches.map((m: any, i: number) => (
                  <div key={m.matchId || i} className="border border-[color:var(--border-subtle)] rounded-lg p-4 space-y-3">
                    {/* Match header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`pill ${matchTypeBadgeColor(m.matchType)}`}>
                          {m.matchType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm text-[color:var(--text-primary)] font-medium">{m.entityName}</span>
                      </div>
                      {/* Score bar */}
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-[color:var(--bg-muted)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.matchScore >= 80 ? 'bg-[color:var(--status-error-text)]' : m.matchScore >= 60 ? 'bg-[color:var(--status-warning-text)]' : 'bg-[color:var(--accent-primary)]'}`}
                            style={{ width: `${m.matchScore}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-[color:var(--text-secondary)] w-8 text-right">{m.matchScore}%</span>
                      </div>
                    </div>

                    {/* Match metadata */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[color:var(--text-tertiary)]">{t('screening.detail.source')}</span>
                        <span className="text-[color:var(--text-primary)]">{m.source}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[color:var(--text-tertiary)]">{t('screening.detail.matchId')}</span>
                        <span className="text-[color:var(--text-primary)] font-mono">{m.matchId}</span>
                      </div>
                    </div>

                    {/* Match details (if present) */}
                    {m.details && Object.keys(m.details).length > 0 && (
                      <div className="bg-[color:var(--bg-muted)] rounded p-3 space-y-1">
                        {Object.entries(m.details).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-[color:var(--text-tertiary)] capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="text-[color:var(--text-primary)]">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review Decision */}
          <div className="card-glow p-6 space-y-4">
            <h2 className="section-label">{t('screening.detail.reviewSection')}</h2>

            <div>
              <label className="block text-xs text-[color:var(--text-tertiary)] mb-1.5">{t('screening.detail.reasonLabel')}</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('screening.detail.reasonPlaceholder')}
                className="w-full bg-[color:var(--bg-muted)] border border-[color:var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--accent-primary)] resize-none"
                rows={3}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={submitting}
                onClick={() => handleReview('APPROVE')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] hover:opacity-80 transition-colors disabled:opacity-50"
              >
                {t('screening.actions.approveFull')}
              </button>
              <button
                disabled={submitting}
                onClick={() => handleReview('BLOCK')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] hover:opacity-80 transition-colors disabled:opacity-50"
              >
                {t('screening.actions.blockFull')}
              </button>
              <button
                disabled={submitting}
                onClick={() => handleReview('ESCALATE')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] hover:opacity-80 transition-colors disabled:opacity-50"
              >
                {t('screening.actions.escalateFull')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
