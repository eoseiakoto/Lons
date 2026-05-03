'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { formatDateTime } from '@/lib/utils';
import type { IInvoice, InvoiceStatus } from '@/lib/graphql/factoring';

interface TimelineStep {
  /** State key — used to build the i18n label and to mark current state. */
  status: InvoiceStatus;
  /** ISO timestamp the state was reached, or null if not yet. */
  reachedAt?: string | null;
}

/**
 * The canonical happy-path lifecycle for an invoice. Branch states (disputed,
 * defaulted, cancelled, rejected) are surfaced separately as a status banner
 * since they short-circuit the linear timeline.
 */
const HAPPY_PATH: InvoiceStatus[] = [
  'submitted',
  'under_review',
  'verified',
  'offer_generated',
  'offer_accepted',
  'funded',
  'debtor_notified',
  'payment_received',
  'reserve_released',
  'settled',
];

const STATUS_LABEL_KEY: Record<InvoiceStatus, string> = {
  submitted: 'factoring.timeline.submitted',
  under_review: 'factoring.timeline.underReview',
  verified: 'factoring.timeline.verified',
  offer_generated: 'factoring.timeline.offerGenerated',
  offer_accepted: 'factoring.timeline.offerAccepted',
  funded: 'factoring.timeline.funded',
  debtor_notified: 'factoring.timeline.debtorNotified',
  payment_received: 'factoring.timeline.paymentReceived',
  reserve_released: 'factoring.timeline.reserveReleased',
  settled: 'factoring.timeline.settled',
  disputed: 'factoring.timeline.disputed',
  defaulted: 'factoring.timeline.defaulted',
  cancelled: 'factoring.timeline.cancelled',
  rejected: 'factoring.timeline.rejected',
};

interface InvoiceLifecycleTimelineProps {
  invoice: IInvoice;
}

/**
 * Visual timeline mirroring the contract detail page pattern. Renders the
 * 10-step happy-path and marks each step:
 *  - reached: solid dot, timestamp shown
 *  - current: pulsing accent
 *  - upcoming: outlined dot, no timestamp
 *
 * If the invoice is in a branch state (disputed / defaulted / cancelled /
 * rejected), a banner is rendered above the timeline noting the deviation.
 */
export function InvoiceLifecycleTimeline({ invoice }: InvoiceLifecycleTimelineProps) {
  const { t } = useI18n();

  const steps: TimelineStep[] = HAPPY_PATH.map((status) => ({
    status,
    reachedAt: timestampForStatus(invoice, status),
  }));
  const currentIndex = HAPPY_PATH.indexOf(invoice.status);

  const isBranch = ['disputed', 'defaulted', 'cancelled', 'rejected'].includes(
    invoice.status,
  );

  return (
    <div className="card-glow p-6 space-y-5">
      <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
        {t('factoring.timeline.title')}
      </h3>

      {isBranch && (
        <div className="rounded-lg p-3 bg-[color:var(--status-warning-soft)] border border-[color:var(--status-warning)]">
          <p className="text-[12px] text-[color:var(--status-warning-text)]">
            {t('factoring.timeline.branchNotice', {
              state: t(STATUS_LABEL_KEY[invoice.status]),
            })}
          </p>
        </div>
      )}

      <ol className="space-y-4">
        {steps.map((step, idx) => {
          const isCurrent = idx === currentIndex && !isBranch;
          const isReached = idx < currentIndex || (idx === currentIndex && !isBranch);
          const dotColor = isCurrent
            ? 'bg-[color:var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]'
            : isReached
              ? 'bg-[color:var(--status-success)]'
              : 'bg-[color:var(--bg-muted)] border border-[color:var(--border-subtle)]';
          const textColor = isReached
            ? 'text-[color:var(--text-primary)]'
            : 'text-[color:var(--text-tertiary)]';

          return (
            <li key={step.status} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${dotColor}${
                    isCurrent ? ' animate-pulse' : ''
                  }`}
                  aria-hidden
                />
                {idx < steps.length - 1 && (
                  <span
                    className="w-px flex-1 mt-1"
                    style={{
                      minHeight: 24,
                      backgroundColor:
                        idx < currentIndex
                          ? 'var(--status-success)'
                          : 'var(--border-subtle)',
                    }}
                    aria-hidden
                  />
                )}
              </div>
              <div className="flex-1 -mt-0.5 pb-1">
                <p className={`text-[13px] font-medium ${textColor}`}>
                  {t(STATUS_LABEL_KEY[step.status])}
                </p>
                {step.reachedAt && (
                  <p className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums mt-0.5">
                    {formatDateTime(step.reachedAt)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Map a happy-path step to the invoice timestamp that recorded it. Where the
 * server doesn't track a discrete timestamp for a stage (e.g. `under_review`,
 * `verified`, `offer_generated`, `offer_accepted`), we fall back to the
 * invoice's `updatedAt` if the stage is the current one.
 */
function timestampForStatus(invoice: IInvoice, status: InvoiceStatus): string | null {
  switch (status) {
    case 'submitted':
      return invoice.createdAt;
    case 'verified':
      return invoice.verifiedAt ?? null;
    case 'funded':
      return invoice.fundedAt ?? null;
    case 'debtor_notified':
      return invoice.debtorNotifiedAt ?? null;
    case 'settled':
      return invoice.settledAt ?? null;
    default:
      // No discrete timestamp on the invoice for this state. Surface the
      // most recent `updatedAt` if this is the active step so the timeline
      // doesn't render a confusing blank gap.
      return invoice.status === status ? invoice.updatedAt : null;
  }
}
