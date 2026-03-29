import { Injectable, Logger } from '@nestjs/common';
import { EventBusService, maskPhone } from '@lons/common';
import { WebhookService } from '../../webhook/webhook.service';
import { DarajaCallbackData } from './mpesa.types';

export interface MpesaWebhookResult {
  processed: boolean;
  referenceId: string;
  status: string;
  message: string;
}

@Injectable()
export class MpesaWebhookHandler {
  private readonly logger = new Logger('MpesaWebhookHandler');

  constructor(
    private webhookService: WebhookService,
    private eventBus: EventBusService,
  ) {}

  /**
   * Handle STK Push callback from Daraja API
   */
  async handleSTKPushCallback(
    payload: DarajaCallbackData,
    signature: string,
    webhookSecret: string,
    tenantId: string,
  ): Promise<MpesaWebhookResult> {
    const stkCallback = payload.Body?.stkCallback;
    if (!stkCallback) {
      this.logger.warn('Received STK Push callback with missing stkCallback body');
      return {
        processed: false,
        referenceId: 'unknown',
        status: 'error',
        message: 'Missing stkCallback body',
      };
    }

    const referenceId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;

    this.logger.log(
      `M-Pesa STK Push callback received for checkout: ${referenceId}, resultCode: ${resultCode}`,
    );

    // Verify signature
    const payloadString = JSON.stringify(payload);
    const isValid = this.webhookService.verifySignature(payloadString, signature, webhookSecret);

    if (!isValid) {
      this.logger.warn(`Invalid signature for M-Pesa STK callback checkout: ${referenceId}`);
      return {
        processed: false,
        referenceId,
        status: 'error',
        message: 'Invalid webhook signature',
      };
    }

    // Check idempotency
    const idempotencyKey = `mpesa-stk-callback-${referenceId}`;
    if (this.webhookService.isIdempotent(idempotencyKey)) {
      this.logger.log(`Duplicate M-Pesa STK callback for checkout: ${referenceId} — skipping`);
      return {
        processed: false,
        referenceId,
        status: resultCode === 0 ? 'COMPLETED' : 'FAILED',
        message: 'Duplicate callback — already processed',
      };
    }

    // Extract metadata from callback
    const metadata: Record<string, string | number | undefined> = {};
    if (stkCallback.CallbackMetadata?.Item) {
      for (const item of stkCallback.CallbackMetadata.Item) {
        metadata[item.Name] = item.Value;
      }
    }

    const phoneNumber = metadata['PhoneNumber'] as string | undefined;
    const maskedPhone = phoneNumber ? maskPhone(String(phoneNumber)) : 'unknown';

    this.logger.log(
      `Processing M-Pesa STK callback: checkout=${referenceId}, resultCode=${resultCode}, phone=${maskedPhone}`,
    );

    const status = resultCode === 0 ? 'completed' : 'failed';
    const eventType = resultCode === 0
      ? 'mpesa.stk_push.completed'
      : 'mpesa.stk_push.failed';

    this.eventBus.emitAndBuild(eventType, tenantId, {
      checkoutRequestId: stkCallback.CheckoutRequestID,
      merchantRequestId: stkCallback.MerchantRequestID,
      resultCode,
      resultDesc: stkCallback.ResultDesc,
      amount: metadata['Amount'],
      mpesaReceiptNumber: metadata['MpesaReceiptNumber'],
      transactionDate: metadata['TransactionDate'],
      phoneNumber: metadata['PhoneNumber'],
    });

    return {
      processed: true,
      referenceId,
      status,
      message: `STK Push callback processed successfully: ${eventType}`,
    };
  }

  /**
   * Handle B2C result callback from Daraja API
   */
  async handleB2CCallback(
    payload: DarajaCallbackData,
    signature: string,
    webhookSecret: string,
    tenantId: string,
  ): Promise<MpesaWebhookResult> {
    const result = payload.Body?.Result;
    if (!result) {
      this.logger.warn('Received B2C callback with missing Result body');
      return {
        processed: false,
        referenceId: 'unknown',
        status: 'error',
        message: 'Missing Result body',
      };
    }

    const referenceId = result.ConversationID;
    const resultCode = result.ResultCode;

    this.logger.log(
      `M-Pesa B2C callback received for conversation: ${referenceId}, resultCode: ${resultCode}`,
    );

    // Verify signature
    const payloadString = JSON.stringify(payload);
    const isValid = this.webhookService.verifySignature(payloadString, signature, webhookSecret);

    if (!isValid) {
      this.logger.warn(`Invalid signature for M-Pesa B2C callback conversation: ${referenceId}`);
      return {
        processed: false,
        referenceId,
        status: 'error',
        message: 'Invalid webhook signature',
      };
    }

    // Check idempotency
    const idempotencyKey = `mpesa-b2c-callback-${referenceId}`;
    if (this.webhookService.isIdempotent(idempotencyKey)) {
      this.logger.log(`Duplicate M-Pesa B2C callback for conversation: ${referenceId} — skipping`);
      return {
        processed: false,
        referenceId,
        status: resultCode === 0 ? 'COMPLETED' : 'FAILED',
        message: 'Duplicate callback — already processed',
      };
    }

    // Extract result parameters
    const resultParams: Record<string, string | number> = {};
    if (result.ResultParameters?.ResultParameter) {
      for (const param of result.ResultParameters.ResultParameter) {
        resultParams[param.Key] = param.Value;
      }
    }

    const receiverPhone = resultParams['ReceiverPartyPublicName'] as string | undefined;
    const maskedReceiver = receiverPhone ? maskPhone(String(receiverPhone)) : 'unknown';

    this.logger.log(
      `Processing M-Pesa B2C callback: conversation=${referenceId}, resultCode=${resultCode}, receiver=${maskedReceiver}`,
    );

    const status = resultCode === 0 ? 'completed' : 'failed';
    const eventType = resultCode === 0
      ? 'mpesa.b2c.completed'
      : 'mpesa.b2c.failed';

    this.eventBus.emitAndBuild(eventType, tenantId, {
      conversationId: result.ConversationID,
      originatorConversationId: result.OriginatorConversationID,
      transactionId: result.TransactionID,
      resultCode,
      resultDesc: result.ResultDesc,
      transactionAmount: resultParams['TransactionAmount'],
      transactionReceipt: resultParams['TransactionReceipt'],
      receiverPartyPublicName: resultParams['ReceiverPartyPublicName'],
      transactionCompletedDateTime: resultParams['TransactionCompletedDateTime'],
      b2CUtilityAccountAvailableFunds: resultParams['B2CUtilityAccountAvailableFunds'],
      b2CWorkingAccountAvailableFunds: resultParams['B2CWorkingAccountAvailableFunds'],
    });

    return {
      processed: true,
      referenceId,
      status,
      message: `B2C callback processed successfully: ${eventType}`,
    };
  }
}
