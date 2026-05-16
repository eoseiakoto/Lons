export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

export const NOTIFICATION_TEMPLATES: Record<string, Record<string, string>> = {
  loan_approved: {
    sms: 'Dear {{customerName}}, your loan application has been approved! {{amount}} {{currency}} is ready for disbursement.',
    email: 'Dear {{customerName}}, your loan application has been approved! {{amount}} {{currency}} is ready for disbursement.',
    push: 'Loan approved: {{amount}} {{currency}}',
    in_app: 'Dear {{customerName}}, your loan application has been approved!',
  },
  offer_sent: {
    sms: 'Dear {{customerName}}, you have a loan offer of {{amount}} {{currency}}. Valid until {{expiresAt}}.',
    email: 'Dear {{customerName}}, you have a loan offer of {{amount}} {{currency}}. Valid until {{expiresAt}}.',
    push: 'New loan offer: {{amount}} {{currency}}',
    in_app: 'You have a loan offer of {{amount}} {{currency}}. Valid until {{expiresAt}}.',
  },
  disbursement_completed: {
    sms: 'Dear {{customerName}}, {{amount}} {{currency}} has been disbursed to your wallet. Contract: {{contractNumber}}.',
    email: 'Dear {{customerName}}, {{amount}} {{currency}} has been disbursed to your wallet. Contract: {{contractNumber}}.',
    push: 'Disbursed: {{amount}} {{currency}}',
    in_app: '{{amount}} {{currency}} has been disbursed. Contract: {{contractNumber}}.',
  },
  repayment_reminder: {
    sms: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} is due on {{dueDate}} for contract {{contractNumber}}.',
    email: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} is due on {{dueDate}} for contract {{contractNumber}}.',
    push: 'Payment due: {{amount}} {{currency}} on {{dueDate}}',
    in_app: 'Your payment of {{amount}} {{currency}} is due on {{dueDate}}.',
  },
  repayment_received: {
    sms: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} has been received for contract {{contractNumber}}.',
    email: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} has been received for contract {{contractNumber}}.',
    push: 'Payment received: {{amount}} {{currency}}',
    in_app: 'Your payment of {{amount}} {{currency}} has been received.',
  },
  overdue_notice: {
    sms: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} for contract {{contractNumber}} is {{daysOverdue}} days overdue. Please pay immediately.',
    email: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} for contract {{contractNumber}} is {{daysOverdue}} days overdue. Please pay immediately.',
    push: 'Overdue: {{amount}} {{currency}} - {{daysOverdue}} days',
    in_app: 'Your payment is {{daysOverdue}} days overdue. Please pay {{amount}} {{currency}} immediately.',
  },
  cooling_off_started: {
    sms: 'Dear {{customerName}}, your loan of {{currency}} {{amount}} has been disbursed. You have {{coolingOffHours}} hours to cancel. Contact your provider to cancel.',
    email: 'Dear {{customerName}}, your loan of {{currency}} {{amount}} has been disbursed. You have a {{coolingOffHours}}-hour cooling-off period during which you may cancel this loan and return the funds. Cooling-off expires: {{expiresAt}}. To cancel, contact your service provider.',
    push: 'Loan {{currency}} {{amount}} disbursed. {{coolingOffHours}}h cooling-off period active.',
    in_app: 'Your loan of {{currency}} {{amount}} has been disbursed. You have {{coolingOffHours}} hours to cancel if you change your mind.',
  },
  cooling_off_cancelled: {
    sms: 'Dear {{customerName}}, your loan of {{currency}} {{amount}} has been cancelled during the cooling-off period. Funds will be collected from your account.',
    email: 'Dear {{customerName}}, your loan of {{currency}} {{amount}} (Contract: {{contractNumber}}) has been cancelled during the cooling-off period. The disbursed amount will be collected from your account. No interest or fees will be charged.',
    push: 'Loan {{currency}} {{amount}} cancelled (cooling-off). Funds will be collected.',
    in_app: 'Your loan has been cancelled during the cooling-off period. The disbursed amount will be collected from your account. No interest or fees apply.',
  },
  cooling_off_expired: {
    sms: 'Dear {{customerName}}, your cooling-off period has ended. Your loan of {{currency}} {{amount}} is now active. First repayment due {{firstRepaymentDate}}.',
    email: 'Dear {{customerName}}, the cooling-off period for your loan of {{currency}} {{amount}} (Contract: {{contractNumber}}) has ended. Your loan is now active. First repayment of {{repaymentAmount}} is due on {{firstRepaymentDate}}.',
    push: 'Cooling-off ended. Loan active. First repayment {{repaymentAmount}} due {{firstRepaymentDate}}.',
    in_app: 'Your cooling-off period has ended. Your loan of {{currency}} {{amount}} is now active. First repayment due on {{firstRepaymentDate}}.',
  },

  // ── Sprint 16 FIX-7 — payment reminder templates ───────────────────
  // Wired into PaymentReminderJob via product.notificationConfig.
  // Variables available: customerName, amount, currency, dueDate,
  // installmentNumber, contractId.
  //
  // The Job dispatches eventType `payment_reminder.{daysBefore}` with
  // an optional `:{installmentId}` discriminator (FIX-4) that the
  // notification service strips before template lookup. Three buckets
  // — 3 days out, 1 day out, due today — match the
  // DEFAULT_REMINDER_CONFIG in payment-reminder.job.ts.
  'payment_reminder.3': {
    sms: 'Hi {{customerName}}, your payment of {{currency}} {{amount}} is due in 3 days ({{dueDate}}). Please ensure sufficient funds.',
    email: 'Payment reminder: {{currency}} {{amount}} due on {{dueDate}}.',
    push: 'Payment of {{currency}} {{amount}} due in 3 days',
    in_app: 'Your installment of {{currency}} {{amount}} is due on {{dueDate}}.',
  },
  'payment_reminder.1': {
    sms: 'Hi {{customerName}}, your payment of {{currency}} {{amount}} is due tomorrow ({{dueDate}}). Please ensure sufficient funds.',
    email: 'Payment due tomorrow: {{currency}} {{amount}}.',
    push: 'Payment of {{currency}} {{amount}} due tomorrow',
    in_app: 'Your installment of {{currency}} {{amount}} is due tomorrow.',
  },
  'payment_reminder.0': {
    sms: 'Hi {{customerName}}, your payment of {{currency}} {{amount}} is due today ({{dueDate}}). Please make your payment now.',
    email: 'Payment due today: {{currency}} {{amount}}.',
    push: 'Payment of {{currency}} {{amount}} due today',
    in_app: 'Your installment of {{currency}} {{amount}} is due today.',
  },

  // Micro-loan-specific templates — used when a product's
  // notificationConfig references these keys explicitly. The
  // PaymentReminderJob resolves `templateKey` from the product
  // config; the Sprint 16 micro-loan-reminder.config.ts seeds use
  // `micro_loan.payment_reminder.{3_day|1_day|due_today}`.
  'micro_loan.payment_reminder.3_day': {
    sms: 'Hi {{customerName}}, your micro-loan repayment of {{currency}} {{amount}} is due in 3 days. Installment {{installmentNumber}}.',
    email: 'Micro-loan repayment reminder: {{currency}} {{amount}} due on {{dueDate}}.',
    push: 'Micro-loan payment due in 3 days: {{currency}} {{amount}}',
    in_app: 'Your micro-loan installment {{installmentNumber}} of {{currency}} {{amount}} is due on {{dueDate}}.',
  },
  'micro_loan.payment_reminder.1_day': {
    sms: 'Hi {{customerName}}, your micro-loan repayment of {{currency}} {{amount}} is due tomorrow. Please ensure your wallet is funded.',
    email: 'Micro-loan payment due tomorrow: {{currency}} {{amount}}.',
    push: 'Micro-loan payment due tomorrow: {{currency}} {{amount}}',
    in_app: 'Your micro-loan installment {{installmentNumber}} of {{currency}} {{amount}} is due tomorrow.',
  },
  'micro_loan.payment_reminder.due_today': {
    sms: 'Hi {{customerName}}, your micro-loan repayment of {{currency}} {{amount}} is due today. Auto-deduction will attempt shortly.',
    email: 'Micro-loan payment due today: {{currency}} {{amount}}.',
    push: 'Micro-loan payment due today: {{currency}} {{amount}}',
    in_app: 'Your micro-loan installment {{installmentNumber}} of {{currency}} {{amount}} is due today.',
  },
};
