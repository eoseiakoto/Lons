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
};
