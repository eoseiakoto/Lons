/**
 * Africa's Talking SMS API Types
 * Defines request/response structures for the AT SMS gateway
 */

export interface ATSendRequest {
  to: string;
  message: string;
  from?: string;
}

export interface ATRecipient {
  statusCode: number;
  number: string;
  cost: string;
  status: string;
  messageId: string;
}

export interface ATSendResponse {
  SMSMessageData: {
    Message: string;
    Recipients: ATRecipient[];
  };
}

export interface ATDeliveryReport {
  id: string;
  status: string;
  phoneNumber: string;
  failureReason?: string;
}

export interface ATBulkSendRequest {
  to: string[];
  message: string;
  from?: string;
}

/**
 * Country-specific cost per SMS segment (in local currency)
 */
export const AT_COST_PER_SMS: Record<string, { cost: string; currency: string }> = {
  '+233': { cost: '0.05', currency: 'GHS' },   // Ghana
  '+254': { cost: '1.00', currency: 'KES' },   // Kenya
  '+256': { cost: '50.00', currency: 'UGX' },  // Uganda
  '+255': { cost: '25.00', currency: 'TZS' },  // Tanzania
  '+234': { cost: '4.00', currency: 'NGN' },   // Nigeria
  '+250': { cost: '15.00', currency: 'RWF' },  // Rwanda
};

/**
 * Default cost for unknown country codes
 */
export const AT_DEFAULT_COST = { cost: '0.10', currency: 'USD' };
