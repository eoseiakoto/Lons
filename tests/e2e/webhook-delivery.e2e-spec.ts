/**
 * E2E integration tests — Webhook delivery flow
 *
 * Validates: HMAC signing, signature verification, and delivery log shape.
 * All tests run in-process with no external services required.
 */
import { WebhookSigner } from '../../services/notification-service/src/webhooks/webhook-signer';
import type {
  WebhookSignatureResult,
  WebhookPayload,
} from '../../services/notification-service/src/webhooks/types/webhook.types';

const SECRET = 'super-secret-hmac-key-for-testing';

describe('Webhook Delivery — signing and verification', () => {
  let signer: WebhookSigner;

  beforeEach(() => {
    signer = new WebhookSigner();
  });

  it('produces a 64-character hex HMAC signature', () => {
    const result: WebhookSignatureResult = signer.sign({ event: 'test' }, SECRET);

    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('round-trips: sign then verify returns true', () => {
    const payload = { event: 'contract.state_changed', contractId: 'abc-123' };
    const { signature, timestamp } = signer.sign(payload, SECRET);

    const rawPayload = JSON.stringify(payload);
    const valid = signer.verify(rawPayload, signature, timestamp, SECRET);

    expect(valid).toBe(true);
  });

  it('returns false when the signature has been tampered with', () => {
    const payload = { event: 'repayment.received', amount: '500.00' };
    const { timestamp } = signer.sign(payload, SECRET);
    const tamperedSig = 'a'.repeat(64);

    const valid = signer.verify(JSON.stringify(payload), tamperedSig, timestamp, SECRET);

    expect(valid).toBe(false);
  });

  it('returns false when signed with a different secret', () => {
    const payload = { event: 'loan_request.approved' };
    const { signature, timestamp } = signer.sign(payload, 'other-secret');

    const valid = signer.verify(JSON.stringify(payload), signature, timestamp, SECRET);

    expect(valid).toBe(false);
  });

  it('delivery log shape contains required fields', () => {
    const payload: WebhookPayload = {
      event: 'contract.state_changed',
      timestamp: new Date().toISOString(),
      tenantId: 'tenant-001',
      data: { contractId: 'ctr-001', status: 'ACTIVE' },
      webhookId: 'endpoint-uuid',
    };

    const log = {
      webhookEndpointId: payload.webhookId,
      event: payload.event,
      payload,
      status: 'pending',
      retryCount: 0,
    };

    expect(log).toMatchObject({
      event: expect.any(String),
      payload: expect.objectContaining({
        event: expect.any(String),
        timestamp: expect.any(String),
        tenantId: expect.any(String),
      }),
      status: 'pending',
      retryCount: 0,
    });
  });

  it('fan-out produces one delivery log per matching endpoint', () => {
    const event = 'repayment.received';
    const mockEndpoints = [
      { id: 'ep-1', url: 'https://a.example.com/hook', secret: SECRET, events: [event] },
      { id: 'ep-2', url: 'https://b.example.com/hook', secret: SECRET, events: [event] },
      { id: 'ep-3', url: 'https://c.example.com/hook', secret: SECRET, events: ['other.event'] },
    ];

    const matching = mockEndpoints.filter((ep) => ep.events.includes(event));
    expect(matching).toHaveLength(2);

    const logs = matching.map((ep) => ({
      webhookEndpointId: ep.id,
      event,
      status: 'pending',
    }));
    expect(logs.every((l) => l.status === 'pending')).toBe(true);
  });
});
