import { Injectable, Logger } from '@nestjs/common';
import { EventBusService, maskPhone } from '@lons/common';
import { WebhookService } from '../../webhook/webhook.service';
import { MoMoCallbackPayload } from './mtn-momo.types';

export interface MoMoWebhookResult {
  processed: boolean;
  referenceId: string;
  status: string;
  message: string;
}

@Injectable()
export class MtnMomoWebhookHandler {
  private readonly logger = new Logger('MtnMomoWebhookHandler');

  constructor(
    private webhookService: WebhookService,
    private eventBus: EventBusService,
  ) {}

  async handleCallback(
    payload: MoMoCallbackPayload,
    signature: string,
    webhookSecret: string,
    tenantId: string,
  ): Promise<MoMoWebhookResult> {
    const referenceId = payload.referenceId;

    this.logger.log(`MoMo callback received for ref: ${referenceId}, status: ${payload.status}`);

    // Verify signature
    const payloadString = JSON.stringify(payload);
    const isValid = this.webhookService.verifySignature(payloadString, signature, webhookSecret);

    if (!isValid) {
      this.logger.warn(`Invalid signature for MoMo callback ref: ${referenceId}`);
      return {
        processed: false,
        referenceId,
        status: payload.status,
        message: 'Invalid webhook signature',
      };
    }

    // Check idempotency
    const idempotencyKey = `momo-callback-${referenceId}`;
    if (this.webhookService.isIdempotent(idempotencyKey)) {
      this.logger.log(`Duplicate MoMo callback for ref: ${referenceId} — skipping`);
      return {
        processed: false,
        referenceId,
        status: payload.status,
        message: 'Duplicate callback — already processed',
      };
    }

    // Parse and emit event
    const party = payload.payee?.partyId || payload.payer?.partyId;
    const maskedParty = party ? maskPhone(party) : 'unknown';

    this.logger.log(
      `Processing MoMo callback: ref=${referenceId}, status=${payload.status}, party=${maskedParty}`,
    );

    const eventType = payload.status === 'SUCCESSFUL'
      ? 'momo.transaction.completed'
      : payload.status === 'FAILED'
        ? 'momo.transaction.failed'
        : 'momo.transaction.pending';

    this.eventBus.emitAndBuild(eventType, tenantId, {
      referenceId: payload.referenceId,
      externalId: payload.externalId,
      financialTransactionId: payload.financialTransactionId,
      status: payload.status,
      amount: payload.amount,
      currency: payload.currency,
      reason: payload.reason,
    });

    return {
      processed: true,
      referenceId,
      status: payload.status,
      message: `Callback processed successfully: ${eventType}`,
    };
  }
}
