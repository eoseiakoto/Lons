/**
 * S17-FIX-4 — unit tests for the post-overdue reminder pass in
 * `PaymentReminderJob.runForTenant`.
 *
 * Scenarios (per dev prompt):
 *   1. Overdue installment at 1 day past due → sends reminder.
 *   2. Overdue installment at 3 days past due → sends reminder.
 *   3. Same installment doesn't get a duplicate reminder for the same day offset
 *      (idempotency via dedupeEventType).
 *   4. Non-overdue installments are not picked up in the overdue pass.
 *
 * The test constructs `PaymentReminderJob` with minimal mocks and drives
 * `runForTenant` directly (no cron scheduling involved).
 */
import { RepaymentScheduleStatus } from '@lons/database';
import { PaymentReminderJob } from './payment-reminder.job';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ENTRY_ID_1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONTRACT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';

/**
 * Build a date offset from today. Negative offset = past date.
 */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ENTRY_ID_1,
    tenantId: TENANT_ID,
    contractId: CONTRACT_ID,
    installmentNumber: 1,
    totalAmount: '100.0000',
    dueDate: daysAgo(1), // 1 day past due by default
    status: RepaymentScheduleStatus.overdue,
    contract: {
      product: {
        id: PRODUCT_ID,
        type: 'bnpl',
        notificationConfig: null, // use defaults
        currency: 'GHS',
      },
      customer: {
        id: CUSTOMER_ID,
        fullName: 'Test Customer',
      },
    },
    ...overrides,
  };
}

function makeJob({
  upcomingEntries = [] as ReturnType<typeof makeEntry>[],
  overdueEntries = [] as ReturnType<typeof makeEntry>[],
  existingNotification = null as null | object,
} = {}) {
  const notification = {
    findFirst: jest.fn().mockResolvedValue(existingNotification),
  };
  const repaymentScheduleEntry = {
    findMany: jest
      .fn()
      .mockResolvedValueOnce(upcomingEntries) // pre-due pass
      .mockResolvedValueOnce(overdueEntries), // overdue pass
  };
  const tenant = { findMany: jest.fn().mockResolvedValue([]) };

  const prisma = {
    repaymentScheduleEntry,
    notification,
    tenant,
    enterTenantContext: jest.fn(async (_ctx: any, fn: () => Promise<any>) => fn()),
  } as any;

  const notificationService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  } as any;

  const job = new PaymentReminderJob(prisma, notificationService);
  return { job, prisma, notificationService, notification, repaymentScheduleEntry };
}

describe('PaymentReminderJob — S17-FIX-4 post-overdue pass', () => {
  it('scenario 1: overdue installment at 1 day past due gets a reminder', async () => {
    const { job, notificationService } = makeJob({
      overdueEntries: [makeEntry({ dueDate: daysAgo(1) })],
    });

    const result = await job.runForTenant(TENANT_ID);

    expect(notificationService.sendNotification).toHaveBeenCalledTimes(1);
    const call = notificationService.sendNotification.mock.calls[0];
    expect(call[0]).toBe(TENANT_ID);
    expect(call[1].eventType).toMatch(/^payment_overdue_reminder\.1:/);
    expect(call[1].customerId).toBe(CUSTOMER_ID);
    expect(result.sent).toBe(1);
  });

  it('scenario 2: overdue installment at 3 days past due gets a reminder', async () => {
    const { job, notificationService } = makeJob({
      overdueEntries: [makeEntry({ dueDate: daysAgo(3) })],
    });

    const result = await job.runForTenant(TENANT_ID);

    expect(notificationService.sendNotification).toHaveBeenCalledTimes(1);
    const call = notificationService.sendNotification.mock.calls[0];
    expect(call[1].eventType).toMatch(/^payment_overdue_reminder\.3:/);
    expect(result.sent).toBe(1);
  });

  it('scenario 3: same installment at same DPD is idempotent — duplicate skipped', async () => {
    const { job, notificationService } = makeJob({
      overdueEntries: [makeEntry({ dueDate: daysAgo(1) })],
      existingNotification: { id: 'notif-1', status: 'sent' }, // already sent
    });

    const result = await job.runForTenant(TENANT_ID);

    expect(notificationService.sendNotification).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.sent).toBe(0);
  });

  it('scenario 4: non-overdue entry (dueDate tomorrow) not picked up in overdue pass', async () => {
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const { job, notificationService } = makeJob({
      // Put a future entry in the overdue query results — the date filter in
      // the Prisma query (dueDate < today) would exclude it, but we simulate
      // it being missed by the Prisma filter by putting it in the results
      // with a positive daysPastDue = -1 (future date). The job calculates
      // daysPastDue = Math.floor((today - dueDate) / ms_per_day) = -1, which
      // is not in the overdueSchedule [1,3,7], so it should skip.
      overdueEntries: [makeEntry({ dueDate: tomorrow })],
    });

    const result = await job.runForTenant(TENANT_ID);

    expect(notificationService.sendNotification).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('installment at 2 DPD (not in default schedule) gets no reminder', async () => {
    const { job, notificationService } = makeJob({
      overdueEntries: [makeEntry({ dueDate: daysAgo(2) })],
    });

    const result = await job.runForTenant(TENANT_ID);

    expect(notificationService.sendNotification).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('product with custom overdueSchedule [2, 5] fires at 2 DPD', async () => {
    const { job, notificationService } = makeJob({
      overdueEntries: [
        makeEntry({
          dueDate: daysAgo(2),
          contract: {
            product: {
              id: PRODUCT_ID,
              type: 'bnpl',
              notificationConfig: {
                paymentReminders: { overdueSchedule: [2, 5] },
              },
              currency: 'GHS',
            },
            customer: { id: CUSTOMER_ID, fullName: 'Test Customer' },
          },
        }),
      ],
    });

    const result = await job.runForTenant(TENANT_ID);

    expect(notificationService.sendNotification).toHaveBeenCalledTimes(1);
    const call = notificationService.sendNotification.mock.calls[0];
    expect(call[1].eventType).toMatch(/^payment_overdue_reminder\.2:/);
    expect(result.sent).toBe(1);
  });
});
