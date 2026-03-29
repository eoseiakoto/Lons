# Sprint 6 — Fix 13: Webhook Delivery Exhausted Listener

> **Context**: This is the **last item blocking Sprint 6 sign-off**. The `webhook.delivery_exhausted` event is emitted by `WebhookDeliveryService.handleFailure()` when all retries are exhausted, but nothing listens for it. SP operators are not notified when webhook deliveries permanently fail.

---

## Problem

`handleFailure()` in `services/notification-service/src/webhooks/webhook-delivery.service.ts` correctly emits:

```typescript
this.eventEmitter.emit('webhook.delivery_exhausted', {
  endpointId: '...',
  deliveryLogId: '...',
  event: '...',
  lastError: '...',
  retryCount: 5,
});
```

But no `@OnEvent('webhook.delivery_exhausted')` listener exists anywhere. The event fires into the void.

---

## What to Build

### 1. Create the Event Listener

**New file**: `services/notification-service/src/webhooks/webhook-delivery-exhausted.listener.ts`

This listener should:
- Subscribe to `webhook.delivery_exhausted` events via `@OnEvent`
- Look up the webhook endpoint to get the `tenantId`
- Query tenant admin users (users with an admin role for that tenant)
- Send an email alert to each admin via the existing `EmailNotificationAdapter`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@lons/database';
import { EmailNotificationAdapter } from '../adapters/email-notification.adapter';

interface WebhookDeliveryExhaustedPayload {
  endpointId: string;
  deliveryLogId: string;
  event: string;
  lastError: string;
  retryCount: number;
}

@Injectable()
export class WebhookDeliveryExhaustedListener {
  private readonly logger = new Logger(WebhookDeliveryExhaustedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAdapter: EmailNotificationAdapter,
  ) {}

  @OnEvent('webhook.delivery_exhausted')
  async handleExhaustedDelivery(payload: WebhookDeliveryExhaustedPayload): Promise<void> {
    try {
      this.logger.warn('Webhook delivery exhausted — notifying SP admins', {
        endpointId: payload.endpointId,
        event: payload.event,
        retryCount: payload.retryCount,
      });

      // 1. Look up the webhook endpoint to get tenantId and URL
      const endpoint = await this.prisma.webhookEndpoint.findUnique({
        where: { id: payload.endpointId },
        select: { tenantId: true, url: true },
      });

      if (!endpoint) {
        this.logger.error(`Webhook endpoint ${payload.endpointId} not found`);
        return;
      }

      // 2. Find admin users for this tenant
      const adminUsers = await this.prisma.user.findMany({
        where: {
          tenantId: endpoint.tenantId,
          role: {
            permissions: { path: [], array_contains: ['admin'] },
          },
          status: 'active',
        },
        select: { email: true, name: true },
      });

      // Fallback: if no admin users found via permissions, find users with admin-like roles
      const recipients = adminUsers.length > 0
        ? adminUsers
        : await this.prisma.user.findMany({
            where: {
              tenantId: endpoint.tenantId,
              role: { name: { in: ['admin', 'Admin', 'sp_admin', 'SP Admin', 'operator', 'Operator'] } },
              status: 'active',
            },
            select: { email: true, name: true },
          });

      if (recipients.length === 0) {
        this.logger.warn(`No admin users found for tenant ${endpoint.tenantId} — cannot send exhaustion alert`);
        return;
      }

      // 3. Send email notification to each admin
      const subject = `[Lōns Alert] Webhook delivery failed permanently`;
      const body = [
        `A webhook delivery has permanently failed after ${payload.retryCount} retry attempts.`,
        ``,
        `Endpoint URL: ${endpoint.url}`,
        `Event: ${payload.event}`,
        `Delivery Log ID: ${payload.deliveryLogId}`,
        `Last Error: ${payload.lastError?.substring(0, 500) ?? 'Unknown'}`,
        ``,
        `Please check the webhook endpoint configuration and ensure the target URL is accessible.`,
        `You can review delivery logs in the admin portal under Webhooks > Delivery Logs.`,
      ].join('\n');

      for (const recipient of recipients) {
        try {
          await this.emailAdapter.send({
            to: recipient.email,
            subject,
            body,
            channel: 'email',
          });
          this.logger.log(`Exhaustion alert sent to ${recipient.email}`);
        } catch (emailError) {
          this.logger.error(`Failed to send exhaustion alert to ${recipient.email}`, emailError);
        }
      }
    } catch (error) {
      // Notification failures must not propagate
      this.logger.error('Failed to process webhook delivery exhaustion event', error);
    }
  }
}
```

**Important notes on the above code**:
- The `EmailNotificationAdapter.send()` method signature may differ from what's shown. Check the actual adapter interface in `services/notification-service/src/adapters/email-notification.adapter.ts` and match the method name and parameter shape exactly.
- The User → Role query may need adjustment depending on the Prisma schema relationship (check if `role` is a direct relation or via `roleId`). Adjust the query accordingly.
- If the email adapter requires fields like `customerId` or `tenantId`, provide them. Use `endpoint.tenantId` for tenant context.
- The goal is pragmatic: send an email alert using whatever the adapter supports today (even if it's console logging in sandbox mode).

### 2. Register the Listener in the Module

**File to modify**: `services/notification-service/src/notification-service.module.ts`

Add the new listener to the `providers` array:

```typescript
import { WebhookDeliveryExhaustedListener } from './webhooks/webhook-delivery-exhausted.listener';

// In providers array, add:
WebhookDeliveryExhaustedListener,
```

### 3. Add a Test

**New file**: `services/notification-service/src/webhooks/__tests__/webhook-delivery-exhausted.listener.spec.ts`

Or add to the existing webhook test file. Test cases:

```typescript
describe('WebhookDeliveryExhaustedListener', () => {
  it('should send email to tenant admin users when delivery is exhausted', async () => {
    // Mock PrismaService to return endpoint with tenantId + admin users
    // Mock EmailNotificationAdapter.send()
    // Call handleExhaustedDelivery() with test payload
    // Verify emailAdapter.send() was called with correct recipient and content
  });

  it('should handle missing webhook endpoint gracefully', async () => {
    // Mock endpoint lookup returning null
    // Verify no email sent, no error thrown
  });

  it('should handle no admin users gracefully', async () => {
    // Mock empty admin user list
    // Verify warning logged, no error thrown
  });

  it('should not propagate email sending failures', async () => {
    // Mock emailAdapter.send() throwing an error
    // Verify error is logged but not thrown
  });
});
```

---

## DO NOT Modify

- `webhook-delivery.service.ts` — the emit logic is correct and already working
- `webhook-delivery.processor.ts` — retry scheduling is correct
- `webhook.resolver.ts` — delivery log filters are correct
- Any files from Fixes 1-12

---

## Verification

After applying this fix:

1. Trigger a webhook delivery to a non-existent URL
2. Wait for all retries to exhaust (or temporarily reduce MAX_RETRIES for testing)
3. Verify in logs: "Webhook delivery exhausted — notifying SP admins" appears
4. Verify in logs: "Exhaustion alert sent to <admin-email>" appears (or "No admin users found" if no admin users exist in test data)
5. If in sandbox mode, the email adapter will log the notification content to console — verify the subject and body are correct
