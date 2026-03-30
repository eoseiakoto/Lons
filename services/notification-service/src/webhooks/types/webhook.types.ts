export interface WebhookPayload {
  event: string;
  timestamp: string;
  tenantId: string;
  data: Record<string, any>;
  webhookId: string;
}

export interface WebhookSignatureResult {
  signature: string;
  timestamp: number;
  signedPayload: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  httpStatus?: number;
  responseBody?: string;
  error?: string;
}
