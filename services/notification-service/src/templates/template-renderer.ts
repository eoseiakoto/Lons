export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

export const NOTIFICATION_TEMPLATES: Record<string, Record<string, string>> = {
  offer_sent: {
    sms: 'Dear {{customerName}}, you have a loan offer of {{amount}} {{currency}}. Valid until {{expiresAt}}.',
  },
  disbursement_completed: {
    sms: 'Dear {{customerName}}, {{amount}} {{currency}} has been disbursed to your wallet. Contract: {{contractNumber}}.',
  },
  repayment_received: {
    sms: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} has been received for contract {{contractNumber}}.',
  },
  repayment_due: {
    sms: 'Dear {{customerName}}, your payment of {{amount}} {{currency}} is due on {{dueDate}} for contract {{contractNumber}}.',
  },
  contract_settled: {
    sms: 'Dear {{customerName}}, your loan {{contractNumber}} has been fully settled. Thank you!',
  },
};
