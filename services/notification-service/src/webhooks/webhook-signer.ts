import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookSignatureResult } from './types/webhook.types';

@Injectable()
export class WebhookSigner {
  sign(payload: Record<string, any>, secret: string): WebhookSignatureResult {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return { signature, timestamp, signedPayload };
  }

  verify(
    payload: string,
    signature: string,
    timestamp: number,
    secret: string,
  ): boolean {
    const signedPayload = `${timestamp}.${payload}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      // timingSafeEqual throws if buffers differ in length (invalid hex)
      return false;
    }
  }
}
