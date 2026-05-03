'use client';

import { gql, useQuery, useMutation, useLazyQuery } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldAlert, UserX } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { TabCreditSummary } from '@/components/customers/tab-credit-summary';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { countryName } from '@/lib/constants';

const CUSTOMER_QUERY = gql`
  query Customer($id: ID!) {
    customer(id: $id) {
      id externalId externalSource fullName gender country region city
      nationalId phonePrimary email kycLevel status blacklistReason watchlist
      anonymizedAt createdAt updatedAt
    }
  }
`;

const EXPOSURE_QUERY = gql`
  query CustomerExposure($customerId: ID!) {
    customerExposure(customerId: $customerId) {
      customerId
      totalExposure
      breakdown { microLoan overdraft bnpl invoiceFactoring }
      activeContractCount
      maxAllowed
      utilizationPercent
    }
  }
`;

const CHECK_ANONYMIZATION_ELIGIBILITY = gql`
  query CheckAnonymizationEligibility($customerId: ID!) {
    checkAnonymizationEligibility(customerId: $customerId) {
      eligible
      reasons
    }
  }
`;

const REQUEST_ANONYMIZATION = gql`
  mutation RequestCustomerAnonymization($customerId: ID!, $reason: String!, $idempotencyKey: String!) {
    requestCustomerAnonymization(customerId: $customerId, reason: $reason, idempotencyKey: $idempotencyKey) {
      success
      customerId
      anonymizedAt
      errors { code message blockingResource }
    }
  }
`;

const SCREENING_HISTORY_QUERY = gql`
  query CustomerScreenings($customerId: ID!, $first: Int) {
    customerScreenings(customerId: $customerId, first: $first) {
      screeningId
      status
      riskLevel
      provider
      screenedAt
      matches {
        matchId
        matchType
        entityName
        matchScore
        source
      }
      reviewedBy
      reviewedAt
      reviewDecision
    }
  }
`;

const SCREEN_CUSTOMER = gql`
  mutation ScreenCustomer($customerId: ID!) {
    screenCustomer(customerId: $customerId) {
      screeningId
      status
      riskLevel
      provider
      screenedAt
      matches {
        matchId
        matchType
        entityName
        matchScore
        source
      }
    }
  }
`;

const BLACKLIST = gql`mutation Blacklist($id: ID!, $reason: String!) { addToBlacklist(customerId: $id, reason: $reason) { id status } }`;
const UNBLACKLIST = gql`mutation Unblacklist($id: ID!) { removeFromBlacklist(customerId: $id) { id status } }`;

// ---------------------------------------------------------------------------
// Screening Tab
// ---------------------------------------------------------------------------

function ScreeningStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    CLEAR: 'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]',
    MATCH: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
    POTENTIAL_MATCH: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
    ERROR: 'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[status] ?? colors.ERROR}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function RiskLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    LOW: 'text-[color:var(--status-success-text)]',
    MEDIUM: 'text-[color:var(--status-warning-text)]',
    HIGH: 'text-[color:var(--status-warning-text)]',
    CRITICAL: 'text-[color:var(--status-error-text)]',
  };
  return <span className={`text-xs font-semibold ${colors[level] ?? 'text-[color:var(--text-tertiary)]'}`}>{level}</span>;
}

function ScreeningTab({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const { data, loading, refetch } = useQuery(SCREENING_HISTORY_QUERY, {
    variables: { customerId, first: 20 },
    fetchPolicy: 'cache-and-network',
  });
  const [screenCustomer, { loading: screening }] = useMutation(SCREEN_CUSTOMER, {
    variables: { customerId },
    onCompleted: () => refetch(),
  });

  const screenings = data?.customerScreenings ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-label">{t('customers.screening.amlSanctions')}</h3>
        <button
          onClick={() => screenCustomer()}
          disabled={screening}
          className="glass-button-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {screening ? t('customers.screening.screening') : t('customers.screening.screenNow')}
        </button>
      </div>

      {loading && screenings.length === 0 && (
        <div className="card p-6 text-[color:var(--text-tertiary)]">{t('customers.screening.loadingHistory')}</div>
      )}

      {!loading && screenings.length === 0 && (
        <div className="card p-6 text-[color:var(--text-tertiary)]">{t('customers.screening.noHistory')}</div>
      )}

      {screenings.length > 0 && (
        <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <table className="table-clean w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('customers.screening.column.date')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('customers.screening.column.provider')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('common.status')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('customers.screening.column.riskLevel')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('customers.screening.column.matches')}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[color:var(--text-tertiary)] uppercase">{t('customers.screening.column.review')}</th>
              </tr>
            </thead>
            <tbody>
              {screenings.map((s: any) => (
                <tr key={s.screeningId} className="border-b border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-muted)] transition-colors">
                  <td className="py-3 px-4 text-[color:var(--text-primary)]">{formatDate(s.screenedAt)}</td>
                  <td className="py-3 px-4 text-[color:var(--text-primary)] capitalize">{s.provider}</td>
                  <td className="py-3 px-4"><ScreeningStatusBadge status={s.status} /></td>
                  <td className="py-3 px-4"><RiskLevelBadge level={s.riskLevel} /></td>
                  <td className="py-3 px-4 text-[color:var(--text-primary)]">{s.matches?.length ?? 0}</td>
                  <td className="py-3 px-4 text-[color:var(--text-secondary)] text-xs">
                    {s.reviewDecision
                      ? <span className="text-[color:var(--accent-primary-deep)]">{s.reviewDecision}</span>
                      : s.status === 'POTENTIAL_MATCH'
                        ? <span className="text-[color:var(--status-warning-text)]">{t('customers.screening.pendingReview')}</span>
                        : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Match details for the most recent screening with matches */}
      {screenings.length > 0 && screenings[0].matches?.length > 0 && (
        <div className="card p-6">
          <h4 className="section-label">
            {t('customers.screening.latestMatches')}
          </h4>
          <div className="space-y-3">
            {screenings[0].matches.map((m: any) => (
              <div key={m.matchId} className="bg-[color:var(--bg-muted)] rounded-lg p-4 border border-[color:var(--border-subtle)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[color:var(--text-primary)] font-medium">{m.entityName}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    m.matchScore >= 90 ? 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]' :
                    m.matchScore >= 70 ? 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]' :
                    'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)]'
                  }`}>
                    {t('customers.screening.matchPercent', { pct: m.matchScore })}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[color:var(--text-tertiary)]">
                  <span>{t('common.type')}: <span className="text-[color:var(--text-secondary)]">{m.matchType.replace(/_/g, ' ')}</span></span>
                  <span>{t('customers.screening.source')}: <span className="text-[color:var(--text-secondary)]">{m.source}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anonymization Dialog
// ---------------------------------------------------------------------------

function AnonymizationDialog({
  customerId,
  onClose,
  onComplete,
}: {
  customerId: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<'checking' | 'results' | 'confirm' | 'done' | 'error'>('checking');
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reasons: string[] } | null>(null);
  const [anonymizationResult, setAnonymizationResult] = useState<{
    success: boolean;
    anonymizedAt?: string;
    errors: { code: string; message: string }[];
  } | null>(null);

  const [checkEligibility] = useLazyQuery(CHECK_ANONYMIZATION_ELIGIBILITY, {
    fetchPolicy: 'network-only',
    onCompleted: (data) => {
      setEligibility(data.checkAnonymizationEligibility);
      setStep('results');
    },
    onError: () => {
      setStep('error');
    },
  });

  const [requestAnonymization, { loading: anonymizing }] = useMutation(REQUEST_ANONYMIZATION, {
    onCompleted: (data) => {
      setAnonymizationResult(data.requestCustomerAnonymization);
      if (data.requestCustomerAnonymization.success) {
        setStep('done');
      } else {
        setStep('error');
      }
    },
    onError: () => {
      setStep('error');
    },
  });

  // Trigger eligibility check on mount
  useState(() => {
    checkEligibility({ variables: { customerId } });
  });

  const handleConfirmAnonymization = () => {
    const idempotencyKey = `anon-${customerId}-${Date.now()}`;
    requestAnonymization({
      variables: { customerId, reason: 'Customer data anonymization request', idempotencyKey },
    });
  };

  const piiFields = [
    t('customers.anonymization.field.fullName'),
    t('customers.anonymization.field.email'),
    t('customers.anonymization.field.phonePrimary'),
    t('customers.anonymization.field.phoneSecondary'),
    t('customers.anonymization.field.nationalId'),
    t('customers.anonymization.field.dateOfBirth'),
    t('customers.anonymization.field.metadata'),
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)] mb-4">{t('customers.anonymization.title')}</h2>

        {step === 'checking' && (
          <div className="text-[color:var(--text-tertiary)] py-8 text-center">{t('customers.anonymization.checking')}</div>
        )}

        {step === 'results' && eligibility && !eligibility.eligible && (
          <div>
            <div className="bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] rounded-lg p-4 mb-4">
              <p className="text-[color:var(--status-error-text)] font-medium mb-2">{t('customers.anonymization.blockedTitle')}</p>
              <p className="text-[color:var(--text-secondary)] text-sm mb-3">
                {t('customers.anonymization.blockedDescription')}
              </p>
              <ul className="space-y-1">
                {eligibility.reasons.map((reason, i) => (
                  <li key={i} className="text-sm text-[color:var(--status-error-text)] flex items-start gap-2">
                    <span className="text-[color:var(--status-error-text)] mt-0.5">&#x2717;</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="glass-button-primary px-4 py-2 text-sm">{t('customers.anonymization.close')}</button>
            </div>
          </div>
        )}

        {step === 'results' && eligibility && eligibility.eligible && (
          <div>
            <div className="bg-[color:var(--status-success-soft)] border border-[color:var(--status-success)] rounded-lg p-4 mb-4">
              <p className="text-[color:var(--status-success-text)] font-medium mb-1">{t('customers.anonymization.eligibleTitle')}</p>
              <p className="text-[color:var(--text-secondary)] text-sm">{t('customers.anonymization.eligibleDescription')}</p>
            </div>
            <button
              onClick={() => setStep('confirm')}
              className="w-full glass-button-primary px-4 py-2 text-sm"
            >
              {t('customers.anonymization.continueToConfirmation')}
            </button>
            <button onClick={onClose} className="w-full mt-2 text-sm text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] py-2">
              {t('common.cancel')}
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <div className="bg-[color:var(--status-warning-soft)] border border-[color:var(--status-warning)] rounded-lg p-4 mb-4">
              <p className="text-[color:var(--status-warning-text)] font-medium mb-2">{t('customers.anonymization.warningIrreversible')}</p>
              <p className="text-[color:var(--text-secondary)] text-sm mb-3">
                {t('customers.anonymization.piiFieldsList')}
              </p>
              <ul className="space-y-1">
                {piiFields.map((field) => (
                  <li key={field} className="text-sm text-[color:var(--text-secondary)] flex items-start gap-2">
                    <span className="text-[color:var(--status-warning-text)] mt-0.5">&#x2022;</span>
                    {field}
                  </li>
                ))}
              </ul>
              <p className="text-[color:var(--text-tertiary)] text-xs mt-3">
                {t('customers.anonymization.preservationNote')}
              </p>
            </div>
            <button
              onClick={handleConfirmAnonymization}
              disabled={anonymizing}
              className="w-full px-4 py-2 bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--text-primary)] rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-50"
            >
              {anonymizing ? t('customers.anonymization.anonymizing') : t('customers.anonymization.confirm')}
            </button>
            <button onClick={onClose} className="w-full mt-2 text-sm text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] py-2">
              {t('common.cancel')}
            </button>
          </div>
        )}

        {step === 'done' && anonymizationResult?.success && (
          <div>
            <div className="bg-[color:var(--status-success-soft)] border border-[color:var(--status-success)] rounded-lg p-4 mb-4">
              <p className="text-[color:var(--status-success-text)] font-medium mb-1">{t('customers.anonymization.completeTitle')}</p>
              <p className="text-[color:var(--text-secondary)] text-sm">
                {t('customers.anonymization.completeDescription')}
                {anonymizationResult.anonymizedAt && (
                  <> {t('customers.anonymization.completeOn', { date: formatDateTime(anonymizationResult.anonymizedAt) })}</>
                )}
                .
              </p>
            </div>
            <button
              onClick={() => { onClose(); onComplete(); }}
              className="w-full glass-button-primary px-4 py-2 text-sm"
            >
              {t('customers.anonymization.close')}
            </button>
          </div>
        )}

        {step === 'error' && (
          <div>
            <div className="bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] rounded-lg p-4 mb-4">
              <p className="text-[color:var(--status-error-text)] font-medium mb-2">{t('customers.anonymization.failedTitle')}</p>
              {anonymizationResult?.errors?.map((err, i) => (
                <p key={i} className="text-sm text-[color:var(--status-error-text)]">{err.message}</p>
              ))}
              {!anonymizationResult?.errors?.length && (
                <p className="text-sm text-[color:var(--status-error-text)]">{t('customers.anonymization.unexpectedError')}</p>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="glass-button-primary px-4 py-2 text-sm">{t('customers.anonymization.close')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer Detail Page
// ---------------------------------------------------------------------------

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, loading, refetch } = useQuery(CUSTOMER_QUERY, { variables: { id } });
  const [blacklist] = useMutation(BLACKLIST);
  const [unblacklist] = useMutation(UNBLACKLIST);
  const [tab, setTab] = useState<'profile' | 'credit' | 'contracts' | 'screening'>('profile');
  const { data: exposureData } = useQuery(EXPOSURE_QUERY, { variables: { customerId: id }, skip: !id });
  const [showAnonymizationDialog, setShowAnonymizationDialog] = useState(false);

  if (loading) return <div className="text-[color:var(--text-secondary)]">{t('common.loading')}</div>;
  const customer = data?.customer;
  if (!customer) return <div className="text-[color:var(--text-secondary)]">{t('customers.notFound')}</div>;

  const isAnonymized = customer.status === 'anonymized';

  const handleBlacklist = async () => {
    const reason = prompt(t('customers.enterBlacklistReason'));
    if (reason) { await blacklist({ variables: { id, reason } }); refetch(); }
  };

  /** Render a field value, showing [Anonymized] badge for anonymized customers on PII fields */
  const renderPiiValue = (value: string | null | undefined, _fieldName: string) => {
    if (isAnonymized) {
      return <span className="text-[color:var(--status-info-text)] italic">{t('customers.anonymizedTag')}</span>;
    }
    return String(value ?? '-');
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <button
        onClick={() => router.back()}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      {/* Hero card */}
      <section className="relative z-10 card-glow-hero card-glow-sweep p-7 lg:p-9">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-5">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-[18px] font-semibold flex-shrink-0"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
                border: '1px solid var(--border-default)',
              }}
            >
              {(customer.fullName || customer.externalId || '?').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="live-dot" aria-hidden />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
                  {t('customers.eyebrowPrefix')} · {customer.externalSource}
                </span>
              </div>
              <h1
                className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
                style={{ fontSize: 36, lineHeight: 1.05 }}
              >
                {isAnonymized ? t('customers.anonymizedTag') : customer.fullName || customer.externalId}
              </h1>
              <p className="text-[12px] font-mono text-[color:var(--text-tertiary)] mt-1">
                {customer.externalId}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={customer.status} />
              {customer.watchlist && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--status-warning-soft)',
                    color: 'var(--status-warning-text)',
                    border: '1px solid var(--status-warning)',
                  }}
                >
                  <ShieldAlert className="w-3 h-3" />
                  {t('customers.watchlist')}
                </span>
              )}
            </div>
            {isAnonymized && customer.anonymizedAt && (
              <span className="text-[11px] text-[color:var(--status-info-text)] flex items-center gap-1.5">
                <UserX className="w-3 h-3" />
                {t('customers.anonymizedOn', { date: formatDate(customer.anonymizedAt) })}
              </span>
            )}
            <div className="flex items-center gap-2 mt-1">
              {!isAnonymized && customer.status !== 'blacklisted' && (
                <>
                  <button
                    onClick={handleBlacklist}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--status-error-soft)',
                      color: 'var(--status-error-text)',
                      border: '1px solid var(--status-error)',
                    }}
                  >
                    {t('customers.blacklist')}
                  </button>
                  {user?.role === 'SP_ADMIN' && (
                    <button
                      onClick={() => setShowAnonymizationDialog(true)}
                      className="btn-ghost text-[12px]"
                    >
                      {t('customers.anonymize')}
                    </button>
                  )}
                </>
              )}
              {!isAnonymized && customer.status === 'blacklisted' && (
                <>
                  <button
                    onClick={() => {
                      unblacklist({ variables: { id } });
                      refetch();
                    }}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--status-success-soft)',
                      color: 'var(--status-success-text)',
                      border: '1px solid var(--status-success)',
                    }}
                  >
                    {t('customers.removeBlacklist')}
                  </button>
                  {user?.role === 'SP_ADMIN' && (
                    <button
                      onClick={() => setShowAnonymizationDialog(true)}
                      className="btn-ghost text-[12px]"
                    >
                      {t('customers.anonymize')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tab nav */}
      <div className="relative z-10">
        <div
          className="inline-flex p-1 rounded-lg gap-1 card-glow"
          style={{ padding: 4 }}
        >
          {(
            [
              { key: 'profile', label: t('customers.profile') },
              { key: 'credit', label: t('customers.credit') },
              { key: 'contracts', label: t('loans.contracts') },
              { key: 'screening', label: t('customers.screeningTab') },
            ] as const
          ).map((item) => {
            const isActive = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() =>
                  setTab(item.key as 'profile' | 'credit' | 'contracts' | 'screening')
                }
                className="relative px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                style={{
                  color: isActive ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="customer-tab-indicator"
                    className="absolute inset-0 rounded-md"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      boxShadow: '0 4px 16px -4px rgba(var(--accent-primary-rgb), 0.45)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'profile' && (
        <div className="relative z-10 space-y-4">
          <div className="card-glow p-6">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-5">
              {t('customers.profile')}
            </h3>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
              {[
                [t('customers.gender'), customer.gender],
                [t('customers.phone'), null, 'phonePrimary'],
                [t('customers.email'), null, 'email'],
                [t('customers.nationalId'), null, 'nationalId'],
                [t('customers.kycLevel'), customer.kycLevel?.replace(/_/g, ' ')],
                [t('customers.country'), countryName(customer.country)],
                [t('customers.region'), customer.region],
                [t('customers.city'), customer.city],
                [t('customers.watchlist'), customer.watchlist ? t('common.yes') : t('common.no')],
                [t('common.created'), formatDate(customer.createdAt)],
                [t('common.updated'), formatDate(customer.updatedAt)],
              ].map(([label, value, piiField]) => (
                <div key={label as string}>
                  <dt className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">
                    {label}
                  </dt>
                  <dd className="text-[14px] text-[color:var(--text-primary)]">
                    {piiField
                      ? renderPiiValue(customer[piiField as keyof typeof customer] as string, piiField as string)
                      : String(value ?? '—')}
                  </dd>
                </div>
              ))}
              {customer.blacklistReason && (
                <div className="col-span-3">
                  <dt className="text-xs font-medium text-[color:var(--status-error-text)] uppercase">{t('customers.blacklistReason')}</dt>
                  <dd className="text-sm text-[color:var(--status-error-text)] mt-1">{customer.blacklistReason}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Exposure Summary Card */}
          {exposureData?.customerExposure && (() => {
            const exp = exposureData.customerExposure;
            const utilization = exp.utilizationPercent;
            const maxNum = parseFloat(exp.maxAllowed) || 0;
            const hasLimit = maxNum > 0;
            const breakdownRows = [
              { label: t('products.types.microLoan'), amount: exp.breakdown.microLoan },
              { label: t('products.types.overdraft'), amount: exp.breakdown.overdraft },
              { label: t('products.types.bnpl'), amount: exp.breakdown.bnpl },
              { label: t('products.types.invoiceFactoring'), amount: exp.breakdown.invoiceFactoring },
            ].filter((r) => parseFloat(r.amount) > 0);
            const totalNum = parseFloat(exp.totalExposure) || 0;

            return (
              <div className="card-glow p-6">
                <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-5">
                  {t('customers.exposureSummary')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
                  <ExposureCell label={t('customers.totalExposure')} value={formatMoney(exp.totalExposure, 'GHS')} accent />
                  <ExposureCell label={t('customers.maxAllowed')} value={hasLimit ? formatMoney(exp.maxAllowed, 'GHS') : t('customers.noLimit')} />
                  <ExposureCell label={t('customers.activeContracts')} value={String(exp.activeContractCount)} />
                </div>
                {hasLimit && (
                  <div className="mb-5">
                    <ProgressBar
                      value={Math.min(utilization, 100)}
                      max={100}
                      size="md"
                      variant={utilization < 60 ? 'success' : utilization < 80 ? 'warning' : 'error'}
                      label={t('customers.utilization')}
                      rightLabel={`${utilization.toFixed(1)}%`}
                    />
                  </div>
                )}
                {breakdownRows.length > 0 && (
                  <div
                    className="space-y-2 pt-5"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2">
                      {t('customers.breakdownByProductType')}
                    </p>
                    {breakdownRows.map((row) => {
                      const pct = totalNum > 0 ? (parseFloat(row.amount) / totalNum) * 100 : 0;
                      return (
                        <div key={row.label} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] text-[color:var(--text-primary)]">
                              {row.label}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-[13px] text-[color:var(--text-primary)] tabular-nums font-semibold">
                                {formatMoney(row.amount, 'GHS')}
                              </span>
                              <span className="text-[11px] text-[color:var(--accent-primary-deep)] tabular-nums w-10 text-right">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <ProgressBar value={pct} max={100} size="sm" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {tab === 'credit' && (
        <TabCreditSummary customer={customer} customerId={id as string} />
      )}

      {tab === 'contracts' && (
        <div className="relative z-10 card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">
          {t('customers.contractsTabPlaceholder')}
        </div>
      )}

      {tab === 'screening' && (
        <div className="relative z-10">
          <ScreeningTab customerId={id as string} />
        </div>
      )}

      {showAnonymizationDialog && (
        <AnonymizationDialog
          customerId={id as string}
          onClose={() => setShowAnonymizationDialog(false)}
          onComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function ExposureCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
        {label}
      </p>
      <p
        className="text-[18px] font-semibold tabular-nums"
        style={{
          color: accent ? 'var(--accent-primary-deep)' : 'var(--text-primary)',
          textShadow: accent ? '0 0 16px rgba(var(--accent-primary-rgb), 0.30)' : undefined,
        }}
      >
        {value}
      </p>
    </div>
  );
}
