import { WebhookSigner } from '../webhook-signer';

describe('WebhookSigner', () => {
  let signer: WebhookSigner;
  const secret = 'test-secret-key-32bytes-long-!!';

  beforeEach(() => {
    signer = new WebhookSigner();
  });

  describe('sign', () => {
    it('should return signature, timestamp, and signedPayload', () => {
      const payload = { event: 'contract.state_changed', tenantId: 'tenant-1' };
      const result = signer.sign(payload, secret);

      expect(result.signature).toBeDefined();
      expect(typeof result.signature).toBe('string');
      expect(result.signature.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.signedPayload).toContain(JSON.stringify(payload));
    });

    it('should produce deterministic signatures for the same input and timestamp', () => {
      const payload = { event: 'loan.disbursed', amount: '500.00' };
      const timestamp = 1700000000;

      // Manually build expected
      const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
      const crypto = require('crypto');
      const expected = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      const result = signer.sign(payload, secret);
      // Verify the signedPayload format
      expect(result.signedPayload).toBe(`${result.timestamp}.${JSON.stringify(payload)}`);
      // Verify the signature matches our manual calculation
      const manualSig = crypto
        .createHmac('sha256', secret)
        .update(result.signedPayload)
        .digest('hex');
      expect(result.signature).toBe(manualSig);
    });
  });

  describe('verify', () => {
    it('should return true for a valid sign/verify roundtrip', () => {
      const payload = { event: 'repayment.received', tenantId: 'tenant-42' };
      const { signature, timestamp } = signer.sign(payload, secret);

      const isValid = signer.verify(
        JSON.stringify(payload),
        signature,
        timestamp,
        secret,
      );

      expect(isValid).toBe(true);
    });

    it('should return false when the payload has been tampered with', () => {
      const payload = { event: 'repayment.received', amount: '100.00' };
      const { signature, timestamp } = signer.sign(payload, secret);

      const tamperedPayload = JSON.stringify({ ...payload, amount: '999.99' });
      const isValid = signer.verify(tamperedPayload, signature, timestamp, secret);

      expect(isValid).toBe(false);
    });

    it('should return false when the wrong secret is used', () => {
      const payload = { event: 'contract.state_changed' };
      const { signature, timestamp } = signer.sign(payload, secret);

      const isValid = signer.verify(
        JSON.stringify(payload),
        signature,
        timestamp,
        'wrong-secret',
      );

      expect(isValid).toBe(false);
    });

    it('should return false when the timestamp is altered', () => {
      const payload = { event: 'loan.approved' };
      const { signature, timestamp } = signer.sign(payload, secret);

      const isValid = signer.verify(
        JSON.stringify(payload),
        signature,
        timestamp + 1,
        secret,
      );

      expect(isValid).toBe(false);
    });

    it('should return false for an invalid hex signature', () => {
      const payload = { event: 'test' };
      const { timestamp } = signer.sign(payload, secret);

      const isValid = signer.verify(
        JSON.stringify(payload),
        'not-valid-hex!!!',
        timestamp,
        secret,
      );

      expect(isValid).toBe(false);
    });
  });
});
