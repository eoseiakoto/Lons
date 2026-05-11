'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { ArrowLeft } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatMoney, formatDate, formatDateTime } from '@/lib/utils';
import { compare, subtract } from '@/lib/decimal';
import { InvoiceStatusBadge } from '@/components/factoring/invoice-status-badge';
import { InvoiceLifecycleTimeline } from '@/components/factoring/invoice-lifecycle-timeline';
import { InvoiceDetailActions } from '@/components/factoring/invoice-detail-actions';
import {
  INVOICE_QUERY,
  DEBTOR_QUERY,
  INVOICE_WEBHOOK_ACTIVITY_QUERY,
  type IInvoice,
  type IDebtor,
  type IWebhookActivityEntry,
} from '@/lib/graphql/factoring';

/**
 * Sprint 13B (S13B-6) — Webhook activity events for an invoice.
 *
 * Backed by the `invoiceWebhookActivity` GraphQL query, which reads the
 * audit log filtered to `match.debtorPayment` / `unmatch.debtorPayment`
 * actions emitted by `DebtorPaymentMatchingService` (process-engine).
 * Tenant-scoped on the server. Only the first page (20 entries) is
 * fetched — pagination can be wired up post-S13B if operators need it.
 */
function useInvoiceWebhookEvents(invoiceId: string): IWebhookActivityEntry[] {
  const { data } = useQuery(INVOICE_WEBHOOK_ACTIVITY_QUERY, {
    variables: { invoiceId, first: 20 },
    fetchPolicy: 'cache-and-network',
    skip: !invoiceId,
  });
  const edges = (data?.invoiceWebhookActivity?.edges ?? []) as Array<{
    node: IWebhookActivityEntry;
  }>;
  return edges.map((e) => e.node);
}

/**
 * S13B-5 (F-S13-2 fix): format the `offerExpiresAt` ISO-8601 string for the
 * Invoice Detail screen.
 *
 * - When status is `offer_generated` and the timestamp is in the future:
 *   "Expires in 23h 14m" (computed at render time; refreshing the page
 *   re-evaluates — real-time countdown is nice-to-have, not required).
 * - Otherwise (status moved on, or expiry is in the past): "Expired
 *   2026-05-08 14:30 UTC".
 * - Returns `null` for the caller to short-circuit when the field is null.
 */
function formatOfferExpiry(
  offerExpiresAt: string | null | undefined,
  status: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { kind: 'pending' | 'past'; text: string } | null {
  if (!offerExpiresAt) return null;
  const expiry = new Date(offerExpiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const now = Date.now();
  const isFuture = expiry.getTime() > now;
  if (status === 'offer_generated' && isFuture) {
    const ms = expiry.getTime() - now;
    const totalMinutes = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const human = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return {
      kind: 'pending',
      text: t('factoring.invoice.offerExpiresIn', { time: human }),
    };
  }
  return {
    kind: 'past',
    text: t('factoring.invoice.offerExpired', {
      date: formatDateTime(offerExpiresAt),
    }),
  };
}

interface CardRowProps {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}

function CardRow({ label, value, emphasis = false }: CardRowProps) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <dt className="text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {label}
      </dt>
      <dd
        className={`tabular-nums ${
          emphasis
            ? 'text-[18px] font-semibold text-[color:var(--accent-primary-deep)]'
            : 'text-[14px] text-[color:var(--text-primary)]'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { t } = useI18n();

  const { data, loading, refetch } = useQuery(INVOICE_QUERY, {
    variables: { invoiceId: id },
    fetchPolicy: 'cache-and-network',
  });

  const invoice = data?.invoice as IInvoice | undefined;

  const { data: debtorData } = useQuery(DEBTOR_QUERY, {
    variables: { debtorId: invoice?.debtorId ?? '' },
    skip: !invoice?.debtorId,
  });
  const debtor = debtorData?.debtor as IDebtor | undefined;

  if (loading && !invoice) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <div className="relative z-10 card-glow p-12 text-center text-[color:var(--text-tertiary)]">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <PageHeader
          title={t('factoring.detail.title')}
          subtitle={t('factoring.detail.notFound')}
        />
        <Link
          href="/loans/factoring"
          className="relative z-10 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('factoring.pipelineTitle')}
        </Link>
      </div>
    );
  }

  // Decimal-string subtraction for the "remaining" indicator. Never `Number(...)`.
  const amountReceived = invoice.amountReceived ?? '0';
  const remaining = subtract(invoice.faceValue, amountReceived);
  const isPartial =
    compare(amountReceived, '0') > 0 && compare(remaining, '0') > 0;
  const isFull = compare(amountReceived, '0') > 0 && compare(remaining, '0') <= 0;

  // S13B-5 (F-S13-2 fix): offer expiry display (countdown vs. past date).
  const offerExpiry = formatOfferExpiry(
    invoice.offerExpiresAt,
    invoice.status,
    t,
  );

  const reserveAmount = invoice.reserveAmount ?? '0';
  const reserveReleased = invoice.reserveReleased ?? '0';
  const reservePending =
    compare(reserveAmount, '0') > 0
      ? subtract(reserveAmount, reserveReleased)
      : '0';

  // S13B-6: webhook events for this invoice — sourced from audit log via
  // the `invoiceWebhookActivity` GraphQL query.
  const webhookEvents = useInvoiceWebhookEvents(invoice.id);
  const matchStrategyLabel = (
    s: string | null | undefined,
  ): string => {
    switch (s) {
      case 'invoice_number':
        return t('factoring.webhookActivity.strategyInvoiceNumber');
      case 'debtor_ref':
        return t('factoring.webhookActivity.strategyDebtorRef');
      case 'fifo':
        return t('factoring.webhookActivity.strategyFifo');
      default:
        return '—';
    }
  };

  return (
    <div className="relative space-y-6 animate-enter">
      <PageBackdrop />

      <Link
        href="/loans/factoring"
        className="relative z-10 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('factoring.pipelineTitle')}
      </Link>

      <PageHeader
        eyebrow={t('factoring.detail.eyebrow')}
        title={invoice.invoiceNumber}
        subtitle={t('factoring.detail.subtitle', {
          faceValue: formatMoney(invoice.faceValue, invoice.currency),
          dueDate: formatDate(invoice.dueDate),
        })}
        actions={<InvoiceStatusBadge status={invoice.status} />}
      />

      <InvoiceDetailActions invoice={invoice} onChanged={() => refetch()} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <InvoiceLifecycleTimeline invoice={invoice} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          {/* Financial terms */}
          <section className="card-glow p-6 space-y-4">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              {t('factoring.detail.financialTerms')}
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CardRow
                label={t('factoring.detail.faceValue')}
                value={formatMoney(invoice.faceValue, invoice.currency)}
              />
              <CardRow
                label={t('factoring.detail.advanceRate')}
                value={`${invoice.advanceRatePercent}%`}
              />
              <CardRow
                label={t('factoring.detail.advancedAmount')}
                value={
                  invoice.advancedAmount
                    ? formatMoney(invoice.advancedAmount, invoice.currency)
                    : '—'
                }
              />
              <CardRow
                label={t('factoring.detail.reserveAmount')}
                value={
                  invoice.reserveAmount
                    ? formatMoney(invoice.reserveAmount, invoice.currency)
                    : '—'
                }
              />
              <CardRow
                label={t('factoring.detail.discountFee')}
                value={
                  invoice.discountFee
                    ? formatMoney(invoice.discountFee, invoice.currency)
                    : '—'
                }
              />
              <CardRow
                label={t('factoring.detail.serviceFee')}
                value={
                  invoice.serviceFee
                    ? formatMoney(invoice.serviceFee, invoice.currency)
                    : '—'
                }
              />
              <CardRow
                label={t('factoring.detail.netDisbursement')}
                value={
                  invoice.netDisbursement
                    ? formatMoney(invoice.netDisbursement, invoice.currency)
                    : '—'
                }
                emphasis
              />
              <CardRow
                label={t('factoring.detail.recourseType')}
                value={
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      invoice.recourseType === 'with_recourse'
                        ? 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]'
                        : 'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]'
                    }`}
                  >
                    {invoice.recourseType === 'with_recourse'
                      ? t('factoring.offer.recourseWith')
                      : t('factoring.offer.recourseWithout')}
                  </span>
                }
              />
              {/* S13B-5 (F-S13-2 fix): offer expiry — countdown when pending,
                  past-date when superseded or expired. */}
              {offerExpiry && (
                <CardRow
                  label={t('factoring.invoice.offerExpiresAt')}
                  value={
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        offerExpiry.kind === 'pending'
                          ? 'bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]'
                          : 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]'
                      }`}
                    >
                      {offerExpiry.text}
                    </span>
                  }
                />
              )}
            </dl>
          </section>

          {/* Debtor info + notification status */}
          <section className="card-glow p-6 space-y-4">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              {t('factoring.detail.debtorSection')}
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CardRow
                label={t('debtors.form.companyName')}
                value={(() => {
                  // S13-4: prefer the nested resolver (one round-trip via the
                  // invoice query) and fall back to the dedicated DEBTOR_QUERY
                  // result (kept for `country` and other detail fields).
                  const companyName =
                    invoice.debtor?.companyName ?? debtor?.companyName;
                  const debtorId = invoice.debtor?.id ?? debtor?.id;
                  if (companyName && debtorId) {
                    return (
                      <Link
                        href={`/debtors/${debtorId}`}
                        className="text-[color:var(--accent-primary-deep)] hover:opacity-80 transition-colors"
                      >
                        {companyName}
                      </Link>
                    );
                  }
                  return (
                    <span className="font-mono text-xs">
                      {invoice.debtorId.slice(0, 12)}…
                    </span>
                  );
                })()}
              />
              <CardRow
                label={t('debtors.form.country')}
                value={debtor?.country ?? '—'}
              />
              <CardRow
                label={t('factoring.detail.notifiedAt')}
                value={
                  invoice.debtorNotifiedAt
                    ? formatDateTime(invoice.debtorNotifiedAt)
                    : t('factoring.detail.notNotified')
                }
              />
              <CardRow
                label={t('factoring.detail.notificationChannel')}
                value={
                  invoice.debtorNotifiedAt
                    ? t('factoring.detail.notificationChannelEmail')
                    : '—'
                }
              />
            </dl>
          </section>

          {/* Payment tracking */}
          <section className="card-glow p-6 space-y-4">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              {t('factoring.detail.paymentTracking')}
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CardRow
                label={t('factoring.detail.amountReceived')}
                value={formatMoney(amountReceived, invoice.currency)}
              />
              <CardRow
                label={t('factoring.detail.paymentRef')}
                value={
                  invoice.debtorPaymentRef ? (
                    <span className="font-mono text-xs">
                      {invoice.debtorPaymentRef}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <CardRow
                label={t('factoring.detail.remaining')}
                value={formatMoney(remaining, invoice.currency)}
              />
              <CardRow
                label={t('factoring.detail.paymentState')}
                value={
                  isFull
                    ? t('factoring.detail.paymentStateFull')
                    : isPartial
                      ? t('factoring.detail.paymentStatePartial')
                      : t('factoring.detail.paymentStateNone')
                }
              />
            </dl>
          </section>

          {/* Reserve status */}
          <section className="card-glow p-6 space-y-4">
            <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              {t('factoring.detail.reserveStatus')}
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CardRow
                label={t('factoring.detail.reserveHeld')}
                value={formatMoney(reserveAmount, invoice.currency)}
              />
              <CardRow
                label={t('factoring.detail.reserveReleased')}
                value={formatMoney(reserveReleased, invoice.currency)}
              />
              <CardRow
                label={t('factoring.detail.reservePending')}
                value={formatMoney(reservePending, invoice.currency)}
              />
              <CardRow
                label={t('factoring.detail.reserveAutoReleased')}
                value={
                  compare(reserveReleased, '0') > 0
                    ? t('common.yes')
                    : t('common.no')
                }
              />
            </dl>
            {compare(reserveAmount, '0') > 0 && (
              <ProgressBar
                value={Number(reserveReleased)}
                max={Number(reserveAmount)}
                size="sm"
                variant="success"
                label={t('factoring.detail.reserveReleasedLabel')}
                rightLabel={`${formatMoney(reserveReleased, invoice.currency)} / ${formatMoney(reserveAmount, invoice.currency)}`}
              />
            )}
          </section>

          {/* S13-1: webhook activity (only rendered if events exist). */}
          {webhookEvents.length > 0 && (
            <section className="card-glow p-6 space-y-4">
              <div>
                <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  {t('factoring.webhookActivity.title')}
                </h3>
                <p className="text-[12px] text-[color:var(--text-tertiary)] mt-1">
                  {t('factoring.webhookActivity.subtitle')}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[12px] uppercase tracking-wider text-[color:var(--text-tertiary)] border-b border-[color:var(--border-subtle)]">
                      <th className="py-2 pr-4 font-normal">
                        {t('factoring.webhookActivity.headerTimestamp')}
                      </th>
                      <th className="py-2 pr-4 font-normal">
                        {t('factoring.webhookActivity.headerTransactionRef')}
                      </th>
                      <th className="py-2 pr-4 font-normal text-right">
                        {t('factoring.webhookActivity.headerAmount')}
                      </th>
                      <th className="py-2 pr-4 font-normal">
                        {t('factoring.webhookActivity.headerStrategy')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookEvents.map((evt) => (
                      <tr
                        key={evt.id}
                        className="border-b border-[color:var(--border-subtle)] last:border-b-0"
                      >
                        <td className="py-2 pr-4 text-[color:var(--text-secondary)] tabular-nums">
                          {formatDateTime(evt.timestamp)}
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs text-[color:var(--text-secondary)]">
                          {evt.transactionRef}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-[color:var(--text-primary)]">
                          {formatMoney(evt.amount, evt.currency)}
                        </td>
                        <td className="py-2 pr-4 text-[color:var(--text-secondary)]">
                          {evt.matchResult.type === 'matched'
                            ? matchStrategyLabel(evt.matchResult.strategy)
                            : evt.matchResult.type === 'currency_mismatch'
                              ? t('factoring.webhookActivity.strategyCurrencyMismatch')
                              : t('factoring.webhookActivity.strategyUnmatched')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
