/**
 * S17-FIX-BA-3 — audit-trail coverage for ApiKeyRotationService.
 *
 * The BA flagged that `rotateApiKey` and `revokeApiKey` on the rotation
 * service did not write audit entries, in violation of FR-SEC-002.3.
 * `rotateWebhookSigningKey` and `onboard` already audit; the rotation
 * service now matches.
 *
 * Critically, audit entries must NEVER contain key/secret values or
 * hashes — only IDs and lifecycle metadata.
 */
import { NotFoundException } from '@nestjs/common';
import { AuditActionType, AuditResourceType } from '@lons/common';

import { ApiKeyRotationService } from './api-key-rotation.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const KEY_ID = '22222222-2222-2222-2222-222222222222';

function makeService() {
  const existingKey = {
    id: KEY_ID,
    tenantId: TENANT,
    name: 'Test Key',
    rateLimitPerMinute: 60,
  };

  const newKeyRow = {
    id: 'newkey-uuid-1',
    tenantId: TENANT,
    name: 'Test Key',
    createdAt: new Date(),
  };

  const apiKey = {
    findFirst: jest.fn().mockResolvedValue(existingKey),
    create: jest.fn().mockResolvedValue(newKeyRow),
    update: jest.fn().mockResolvedValue({ ...existingKey, revokedAt: new Date() }),
  };

  // $transaction returns the array of resolved promises in order;
  // the rotation code destructures [newApiKey] from index 0.
  const prisma = {
    apiKey,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => {
      // The ops are actually Prisma client *operations*, not Promises —
      // but in the production code path Prisma awaits them inside
      // $transaction. The mock above already returns resolved values
      // from create/update, so we just hand them back.
      return Promise.all(ops);
    }),
  } as unknown as any;

  const auditService = {
    log: jest.fn(async () => undefined),
  } as unknown as any;

  const service = new ApiKeyRotationService(prisma, auditService);
  return { service, prisma, apiKey, auditService };
}

describe('ApiKeyRotationService — audit trail (S17-FIX-BA-3)', () => {
  describe('rotateApiKey', () => {
    it('writes API_KEY_ROTATED audit entry on successful rotation', async () => {
      const { service, auditService } = makeService();

      await service.rotateApiKey(TENANT, KEY_ID, 24);

      expect(auditService.log).toHaveBeenCalledTimes(1);
      const entry = auditService.log.mock.calls[0][0];
      expect(entry).toEqual(
        expect.objectContaining({
          tenantId: TENANT,
          action: AuditActionType.API_KEY_ROTATED,
          resourceType: AuditResourceType.API_KEY,
          resourceId: KEY_ID,
          actorType: 'system',
        }),
      );
    });

    it('audit metadata carries IDs + grace period, NOT key values or hashes', async () => {
      const { service, auditService } = makeService();

      await service.rotateApiKey(TENANT, KEY_ID, 48);

      const entry = auditService.log.mock.calls[0][0];
      expect(entry.metadata).toEqual({
        previousKeyId: KEY_ID,
        newKeyId: 'newkey-uuid-1',
        gracePeriodHours: 48,
      });
      // Defense-in-depth — the metadata blob must never contain key or
      // secret material. Stringify and check for prefixes / hash hex.
      const metaStr = JSON.stringify(entry.metadata);
      expect(metaStr).not.toMatch(/lons_secret_/);
      expect(metaStr).not.toMatch(/^lons_/m);
      expect(metaStr).not.toMatch(/[a-f0-9]{64}/); // SHA-256 hash shape
    });

    it('does NOT audit when rotation fails — key not found', async () => {
      const { service, prisma, auditService } = makeService();
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.rotateApiKey(TENANT, KEY_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('revokeApiKey', () => {
    it('writes API_KEY_REVOKED audit entry on successful revocation', async () => {
      const { service, auditService } = makeService();

      await service.revokeApiKey(TENANT, KEY_ID);

      expect(auditService.log).toHaveBeenCalledTimes(1);
      const entry = auditService.log.mock.calls[0][0];
      expect(entry).toEqual(
        expect.objectContaining({
          tenantId: TENANT,
          action: AuditActionType.API_KEY_REVOKED,
          resourceType: AuditResourceType.API_KEY,
          resourceId: KEY_ID,
          actorType: 'system',
        }),
      );
      expect(entry.metadata).toHaveProperty('revokedAt');
      expect(typeof entry.metadata.revokedAt).toBe('string');
    });

    it('audit metadata carries only the revoke timestamp', async () => {
      const { service, auditService } = makeService();

      await service.revokeApiKey(TENANT, KEY_ID);

      const entry = auditService.log.mock.calls[0][0];
      const metaStr = JSON.stringify(entry.metadata);
      // No key/secret material in metadata.
      expect(metaStr).not.toMatch(/lons_secret_/);
      expect(metaStr).not.toMatch(/^lons_/m);
      expect(metaStr).not.toMatch(/[a-f0-9]{64}/);
    });

    it('does NOT audit when revocation fails — key not found', async () => {
      const { service, prisma, auditService } = makeService();
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.revokeApiKey(TENANT, KEY_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });
});
