'use client';

import dynamic from 'next/dynamic';
import { gql, useQuery } from '@apollo/client';
import { DataTable } from '@/components/ui/data-table';
import { useI18n } from '@/lib/i18n';
import { formatMoney, formatDate, formatPercent } from '@/lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';

const SCORING_HISTORY_QUERY = gql`
  query CustomerScoringHistory($customerId: ID!, $first: Int) {
    customerScoringHistory(customerId: $customerId, first: $first) {
      id
      score
      scoreRangeMin
      scoreRangeMax
      riskTier
      modelType
      modelVersion
      recommendedLimit
      contributingFactors
      confidence
      context
      createdAt
    }
  }
`;

/**
 * S17-10 / FR-CM-003.1 — Aggregated credit-exposure summary across
 * subscriptions and overdraft credit lines. Cached server-side (5
 * minute TTL); the resolver is invalidated by repayment / scoring /
 * subscription events.
 */
const CREDIT_SUMMARY_QUERY = gql`
  query CustomerCreditSummaryAggregate($customerId: ID!) {
    customerCreditSummary(customerId: $customerId) {
      customerId
      currentScore
      scoreModelVersion
      riskTier
      totalCreditLimit
      totalExposure
      totalUtilizedCredit
      totalAvailableCredit
      activeContracts
      overdueContracts
      worstDelinquency
      totalOutstandingBalance
      lastScoreDate
    }
  }
`;

interface TabCreditSummaryProps {
  customer: any;
  customerId: string;
}

const riskTierConfig: Record<string, { labelKey: string; color: string; bg: string }> = {
  low: { labelKey: 'customers.creditSummary.lowRisk', color: 'text-[color:var(--status-success-text)]', bg: 'bg-[color:var(--status-success-soft)] border-[color:var(--status-success)]' },
  medium: { labelKey: 'customers.creditSummary.mediumRisk', color: 'text-[color:var(--status-warning-text)]', bg: 'bg-[color:var(--status-warning-soft)] border-[color:var(--status-warning)]' },
  high: { labelKey: 'customers.creditSummary.highRisk', color: 'text-[color:var(--status-error-text)]', bg: 'bg-[color:var(--status-error-soft)] border-[color:var(--status-error)]' },
  critical: { labelKey: 'customers.creditSummary.criticalRisk', color: 'text-[color:var(--status-error-text)]', bg: 'bg-[color:var(--status-error-soft)] border-[color:var(--status-error)]' },
};

const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '12px',
};

function RiskTierBadge({ tier }: { tier: string }) {
  const { t } = useI18n();
  const config = riskTierConfig[tier];
  const label = config ? t(config.labelKey) : tier;
  const color = config?.color || 'text-[color:var(--text-secondary)]';
  const bg = config?.bg || 'bg-[color:var(--bg-muted)] border-[color:var(--border-subtle)]';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${bg} ${color}`}>
      {label}
    </span>
  );
}

// Dynamic chart wrappers to avoid SSR issues with recharts
const FactorsChart = dynamic(
  () =>
    Promise.resolve({
      default: function FactorsChartInner({ factors }: { factors: { name: string; weight: number }[] }) {
        return (
          <ResponsiveContainer width="100%" height={Math.max(200, factors.length * 40)}>
            <BarChart data={factors} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
                {factors.map((entry, i) => (
                  <Cell key={i} fill={entry.weight >= 0 ? '#34d399' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      },
    }),
  { ssr: false },
);

const ScoreHistoryChart = dynamic(
  () =>
    Promise.resolve({
      default: function ScoreHistoryChartInner({ data }: { data: { date: string; score: number }[] }) {
        return (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ fill: '#60a5fa', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      },
    }),
  { ssr: false },
);

export function TabCreditSummary({ customer, customerId }: TabCreditSummaryProps) {
  const { t } = useI18n();
  const creditScore = customer.creditScore ?? null;
  const creditLimit = customer.creditLimit ?? null;
  const creditUtilization = customer.creditUtilization ?? null;
  const currency = customer.currency || 'GHS';

  const { data, loading } = useQuery(SCORING_HISTORY_QUERY, {
    variables: { customerId, first: 50 },
    skip: !customerId,
  });

  // S17-10 — pull the aggregated credit exposure summary alongside the
  // scoring history. Independent query so each renders as it arrives.
  const { data: summaryData } = useQuery(CREDIT_SUMMARY_QUERY, {
    variables: { customerId },
    skip: !customerId,
  });
  const creditSummary = summaryData?.customerCreditSummary ?? null;

  const scoringResults = data?.customerScoringHistory ?? [];
  const latestResult = scoringResults.length > 0 ? scoringResults[0] : null;

  // Contributing factors from latest result
  const contributingFactors: { name: string; weight: number }[] = [];
  if (latestResult?.contributingFactors) {
    const cf = latestResult.contributingFactors;
    if (Array.isArray(cf)) {
      contributingFactors.push(...cf);
    } else if (typeof cf === 'object') {
      for (const [name, weight] of Object.entries(cf)) {
        contributingFactors.push({ name, weight: Number(weight) });
      }
    }
  }
  contributingFactors.sort((a, b) => b.weight - a.weight);

  // Score history for line chart (chronological order)
  const scoreHistory = [...scoringResults]
    .reverse()
    .map((r: any) => ({
      date: formatDate(r.createdAt),
      score: parseFloat(r.score),
    }));

  const getScoreColor = (score: number) => {
    if (score >= 700) return 'text-[color:var(--status-success-text)]';
    if (score >= 500) return 'text-[color:var(--status-warning-text)]';
    return 'text-[color:var(--status-error-text)]';
  };

  const getScoreBg = (score: number) => {
    if (score >= 700) return 'bg-[color:var(--status-success-soft)] border-[color:var(--status-success)]';
    if (score >= 500) return 'bg-[color:var(--status-warning-soft)] border-[color:var(--status-warning)]';
    return 'bg-[color:var(--status-error-soft)] border-[color:var(--status-error)]';
  };

  const displayScore = latestResult ? parseFloat(latestResult.score) : creditScore;

  return (
    <div className="space-y-6">
      {/* S17-10 — Aggregated exposure summary header. Renders only
          when the aggregate query has resolved (cache-backed, so the
          first paint is usually instant). Sits above the per-metric
          cards so operators see the total picture at a glance. */}
      {creditSummary ? (
        <div className="card p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-1">
                Total Credit Limit
              </p>
              <p className="text-xl font-bold">
                {formatMoney(creditSummary.totalCreditLimit, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-1">
                Utilized
              </p>
              <p className="text-xl font-bold">
                {formatMoney(creditSummary.totalUtilizedCredit, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-1">
                Available
              </p>
              <p className="text-xl font-bold text-[color:var(--status-success-text)]">
                {formatMoney(creditSummary.totalAvailableCredit, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-1">
                Worst DPD
              </p>
              <p
                className={
                  creditSummary.worstDelinquency === 'current'
                    ? 'text-xl font-bold text-[color:var(--status-success-text)]'
                    : creditSummary.worstDelinquency === 'overdue'
                      ? 'text-xl font-bold text-[color:var(--status-warning-text)]'
                      : 'text-xl font-bold text-[color:var(--status-error-text)]'
                }
              >
                {creditSummary.worstDelinquency.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-6 text-xs text-[color:var(--text-tertiary)]">
            <span>
              <strong className="text-[color:var(--text-primary)]">
                {creditSummary.activeContracts}
              </strong>{' '}
              active
            </span>
            <span>
              <strong className="text-[color:var(--text-primary)]">
                {creditSummary.overdueContracts}
              </strong>{' '}
              overdue
            </span>
            <span>
              Outstanding:{' '}
              <strong className="text-[color:var(--text-primary)]">
                {formatMoney(creditSummary.totalOutstandingBalance, currency)}
              </strong>
            </span>
          </div>
        </div>
      ) : null}

      {/* Top metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-6 text-center">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-2">{t('customers.creditSummary.creditScore')}</p>
          {displayScore !== null ? (
            <>
              <p className={`text-4xl font-bold ${getScoreColor(displayScore)}`}>{Math.round(displayScore)}</p>
              {latestResult ? (
                <RiskTierBadge tier={latestResult.riskTier} />
              ) : (
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium border ${getScoreBg(displayScore)}`}>
                  {displayScore >= 700 ? t('customers.creditSummary.excellent') : displayScore >= 500 ? t('customers.creditSummary.fair') : t('customers.creditSummary.poor')}
                </span>
              )}
            </>
          ) : (
            <p className="kpi-value text-[color:var(--text-tertiary)]">--</p>
          )}
        </div>

        <div className="card p-6 text-center">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-2">{t('customers.creditSummary.creditLimit')}</p>
          {creditLimit !== null ? (
            <p className="kpi-value">{formatMoney(String(creditLimit), currency)}</p>
          ) : (
            <p className="kpi-value text-[color:var(--text-tertiary)]">--</p>
          )}
        </div>

        <div className="card p-6 text-center">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-2">{t('customers.creditSummary.utilization')}</p>
          {creditUtilization !== null ? (
            <>
              <p className="kpi-value">{formatPercent(creditUtilization)}</p>
              <div className="mt-3 w-full bg-[color:var(--bg-muted)] rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${creditUtilization > 0.8 ? 'bg-[color:var(--status-error)]' : creditUtilization > 0.5 ? 'bg-[color:var(--status-warning)]' : 'bg-[color:var(--status-success)]'}`}
                  style={{ width: `${Math.min(creditUtilization * 100, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <p className="kpi-value text-[color:var(--text-tertiary)]">--</p>
          )}
        </div>

        <div className="card p-6 text-center">
          <p className="text-xs font-medium text-[color:var(--text-tertiary)] uppercase mb-2">{t('customers.creditSummary.recommendedLimit')}</p>
          {latestResult?.recommendedLimit ? (
            <>
              <p className="kpi-value">
                {formatMoney(latestResult.recommendedLimit, currency)}
              </p>
              {creditLimit !== null && (
                <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
                  {parseFloat(latestResult.recommendedLimit) > creditLimit
                    ? t('customers.creditSummary.aboveCurrentLimit')
                    : parseFloat(latestResult.recommendedLimit) < creditLimit
                      ? t('customers.creditSummary.belowCurrentLimit')
                      : t('customers.creditSummary.matchesCurrentLimit')}
                </p>
              )}
            </>
          ) : (
            <p className="kpi-value text-[color:var(--text-tertiary)]">--</p>
          )}
        </div>
      </div>

      {/* Contributing Factors */}
      <div className="card p-6">
        <h3 className="section-label mb-4">{t('customers.creditSummary.contributingFactors')}</h3>
        {loading ? (
          <div className="text-center py-8 text-[color:var(--text-tertiary)]">{t('customers.creditSummary.loadingScoringData')}</div>
        ) : contributingFactors.length > 0 ? (
          <FactorsChart factors={contributingFactors} />
        ) : (
          <div className="flex items-center justify-center py-8 text-[color:var(--text-tertiary)]">
            <p className="text-sm">{t('customers.creditSummary.noContributingFactors')}</p>
          </div>
        )}
      </div>

      {/* Score History Chart */}
      <div className="card p-6">
        <h3 className="section-label mb-4">{t('customers.creditSummary.scoreHistory')}</h3>
        {loading ? (
          <div className="text-center py-8 text-[color:var(--text-tertiary)]">{t('common.loading')}</div>
        ) : scoreHistory.length > 1 ? (
          <ScoreHistoryChart data={scoreHistory} />
        ) : scoreHistory.length === 1 ? (
          <div className="flex items-center justify-center py-8 text-[color:var(--text-tertiary)]">
            <p className="text-sm">{t('customers.creditSummary.singleScoreResult')}</p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-[color:var(--text-tertiary)]">
            <p className="text-sm">{t('customers.creditSummary.noScoringHistory')}</p>
          </div>
        )}
      </div>

      {/* Scoring History Table */}
      <div className="card p-6">
        <h3 className="section-label mb-4">{t('customers.creditSummary.scoringResults')}</h3>
        {loading ? (
          <div className="text-center py-8 text-[color:var(--text-tertiary)]">{t('common.loading')}</div>
        ) : scoringResults.length > 0 ? (
          <DataTable
            columns={[
              { header: t('customers.creditSummary.date'), accessor: (r: any) => formatDate(r.createdAt) },
              { header: t('customers.creditSummary.score'), accessor: (r: any) => (
                <span className={getScoreColor(parseFloat(r.score))}>{parseFloat(r.score).toFixed(1)}</span>
              ) },
              { header: t('customers.creditSummary.riskTier'), accessor: (r: any) => <RiskTierBadge tier={r.riskTier} /> },
              { header: t('customers.creditSummary.modelVersion'), accessor: (r: any) => `${r.modelType} v${r.modelVersion}` },
              { header: t('customers.creditSummary.context'), accessor: (r: any) => (
                <span className="capitalize">{r.context?.replace(/_/g, ' ') || '-'}</span>
              ) },
              { header: t('customers.creditSummary.confidence'), accessor: (r: any) =>
                r.confidence ? `${(parseFloat(r.confidence) * 100).toFixed(1)}%` : '-'
              },
            ]}
            data={scoringResults}
          />
        ) : (
          <div className="text-center py-8 text-[color:var(--text-tertiary)]">{t('customers.creditSummary.noScoringResults')}</div>
        )}
      </div>
    </div>
  );
}
