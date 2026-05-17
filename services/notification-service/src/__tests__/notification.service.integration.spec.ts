/**
 * S17-FIX-BA-6 (Sprint 16 carry-forward) — integration coverage for
 * the colon-discriminator template-lookup mechanism.
 *
 * Why this exists
 * ---------------
 * `NotificationService.sendNotification()` calls
 * `params.eventType.split(':')[0]` before looking the template up in
 * `NOTIFICATION_TEMPLATES`. The discriminator lets schedulers append
 * per-row identifiers (e.g. `payment_reminder.3:installment-uuid`) for
 * dedupe scoping without requiring the template registry to enumerate
 * every installment.
 *
 * The mechanism shipped in Sprint 16 (FIX-4) with zero tests. A future
 * refactor of either side (the `split` call or the template registry
 * key shape) could silently break every per-installment reminder —
 * both pre-due and overdue — and no unit test would notice.
 *
 * This spec wires the REAL NOTIFICATION_TEMPLATES registry, mocks only
 * the Prisma + adapter boundary, and asserts the round-trip behaviour
 * end to end.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lons/database';

import { NotificationService } from '../notification.service';
import { NotificationAdapterResolver } from '../adapters/notification-adapter-resolver.service';

const TENANT = 'tenant-int-1';
const CUSTOMER = 'customer-int-1';
const CONTRACT = 'contract-int-1';

const baseVariables = {
  customerName: 'Jane',
  amount: '500.00',
  currency: 'GHS',
  dueDate: '2026-05-20',
  installmentNumber: '3',
  daysPastDue: '3',
};

describe('NotificationService — template lookup integration (S17-FIX-BA-6)', () => {
  let service: NotificationService;
  let adapterSend: jest.Mock;

  beforeEach(async () => {
    // Capture whatever `content` the service rendered before handing
    // it to the adapter. The mock echoes the payload back so tests
    // can assert on the rendered body.
    adapterSend = jest.fn(async (_tenantId: string, payload: { content: string; eventType: string; channel: string }) => ({
      id: 'notif-int-1',
      content: payload.content,
      eventType: payload.eventType,
      channel: payload.channel,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: PrismaService,
          useValue: {
            customer: {
              findFirst: jest.fn().mockResolvedValue({
                id: CUSTOMER,
                fullName: 'Jane',
                phonePrimary: '+233200000000',
                email: 'jane@example.test',
              }),
            },
          },
        },
        {
          provide: NotificationAdapterResolver,
          useValue: {
            resolve: jest.fn().mockResolvedValue({ send: adapterSend }),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('colon-discriminator lookup', () => {
    it('resolves the template via prefix when eventType contains :discriminator', async () => {
      // Mimics what PaymentReminderJob ships: payment_reminder.3 +
      // appended installment UUID. Without the split(':')[0] mechanism
      // this would miss the template and return null.
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'payment_reminder.3:0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
        channel: 'sms',
        variables: baseVariables,
      });

      expect(result).not.toBeNull();
      expect((result as { content: string }).content).toContain('Jane');
      expect((result as { content: string }).content).toContain('500.00');
      expect((result as { content: string }).content).toContain('GHS');
      // Adapter receives the FULL eventType (with discriminator) so
      // dedupe scoping persists on the notification row.
      expect(adapterSend.mock.calls[0][1].eventType).toBe(
        'payment_reminder.3:0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
      );
    });

    it('resolves the same template for the overdue family — payment_overdue_reminder.3:uuid', async () => {
      // Post-overdue family was added in S17-FIX-4. Same split mechanism
      // must keep them working. Channel is product-resolved by the job
      // now (S17-FIX-BA-4) — here we just verify the lookup contract.
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'payment_overdue_reminder.3:11111111-1111-1111-1111-111111111111',
        channel: 'sms',
        variables: baseVariables,
      });

      expect(result).not.toBeNull();
      expect((result as { content: string }).content).toContain('Jane');
      expect((result as { content: string }).content).toContain('500.00');
    });

    it('resolves a plain eventType without discriminator (no regression)', async () => {
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'payment_reminder.3',
        channel: 'sms',
        variables: baseVariables,
      });

      expect(result).not.toBeNull();
      expect((result as { content: string }).content).toContain('Jane');
    });

    it('returns null for a completely unknown eventType (even with a discriminator)', async () => {
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'nonexistent_event_type:abc-123',
        channel: 'sms',
        variables: baseVariables,
      });

      expect(result).toBeNull();
      expect(adapterSend).not.toHaveBeenCalled();
    });

    it('split(":")[0] only strips at the first colon — discriminator may contain colons safely', async () => {
      // Pathological eventType: a UUID-like discriminator that itself
      // contains colons (e.g., from an external system's compound key).
      // The lookup must still resolve via the prefix before the first
      // colon and NOT swallow the rest.
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'payment_reminder.3:external:compound:id',
        channel: 'sms',
        variables: baseVariables,
      });

      expect(result).not.toBeNull();
      expect((result as { content: string }).content).toContain('Jane');
      // Full eventType (including the multi-colon discriminator) is
      // preserved on the persisted notification row.
      expect(adapterSend.mock.calls[0][1].eventType).toBe(
        'payment_reminder.3:external:compound:id',
      );
    });
  });
});
