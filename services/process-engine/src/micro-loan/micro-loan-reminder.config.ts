/**
 * Sprint 16 (S16-3) — micro-loan payment reminder defaults.
 *
 * Micro-loan products store their reminder schedule on
 * `product.notificationConfig.paymentReminders`. The generic payment
 * reminder scheduler (S16-10) reads from there; when the field is
 * missing for a micro-loan product, callers can fall back to this
 * default by spreading it into the product's config at create time.
 *
 * The template keys here MUST exist in the notification template
 * registry consumed by `NotificationService` — admin operators
 * register them per-tenant when the SP activates a micro-loan product.
 * For now the keys are documented inline; the runtime falls back to
 * the generic `payment_reminder.*` templates if the micro-loan ones
 * are missing (see S16-10's resolver logic).
 */
export const MICRO_LOAN_DEFAULT_REMINDERS = {
  enabled: true,
  schedule: [
    {
      daysBefore: 3,
      channel: 'sms' as const,
      templateKey: 'micro_loan.payment_reminder.3_day',
    },
    {
      daysBefore: 1,
      channel: 'sms' as const,
      templateKey: 'micro_loan.payment_reminder.1_day',
    },
    {
      daysBefore: 0,
      channel: 'sms' as const,
      templateKey: 'micro_loan.payment_reminder.due_today',
    },
  ],
} as const;

/**
 * Inline template bodies — referenced by `templateKey` from
 * `NotificationService.send()`. The notification service substitutes
 * `{amount}`, `{currency}`, `{dueDate}`, `{customerName}`,
 * `{installmentNumber}` at dispatch time.
 *
 * These live as a constant rather than DB rows because they're
 * tenant-agnostic and version-locked to the product code. Per-tenant
 * override hooks into the same templateKey via the existing
 * notification provider config.
 */
export const MICRO_LOAN_REMINDER_TEMPLATES = {
  'micro_loan.payment_reminder.3_day': {
    channel: 'sms',
    body: 'Your micro-loan payment of {amount} {currency} is due on {dueDate}. Please ensure sufficient wallet balance.',
  },
  'micro_loan.payment_reminder.1_day': {
    channel: 'sms',
    body: 'Reminder: Your micro-loan payment of {amount} {currency} is due tomorrow ({dueDate}).',
  },
  'micro_loan.payment_reminder.due_today': {
    channel: 'sms',
    body: 'Your micro-loan payment of {amount} {currency} is due today. The system will attempt automatic deduction.',
  },
} as const;
