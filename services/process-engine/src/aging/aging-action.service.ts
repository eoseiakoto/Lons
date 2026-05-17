import { Injectable, Logger, Optional } from '@nestjs/common';

import {
  AgingBucketConfig,
  PrismaService,
  SubscriptionStatus,
} from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Sprint 16 (S16-12) — action matrix shapes.
 *
 * Stored as JSONB on `aging_bucket_configs.actions`. Each action has
 * a `type` discriminator + per-type `config` object. New action types
 * are added by extending this enum + adding a handler branch in
 * `AgingActionService.executeActions`.
 */
export type AgingActionType =
  | 'SEND_NOTIFICATION'
  | 'APPLY_PENALTY'
  | 'SUSPEND_BORROWING'
  | 'ESCALATE_TO_COLLECTIONS'
  | 'REPORT_TO_BUREAU';

/**
 * S17-FIX-5: SUSPEND_BORROWING scope. Seeded configs without a `scope` field
 * get the safer default (`'product'`) — only the triggering product's
 * subscriptions are suspended rather than all the customer's subscriptions.
 */
export type SuspendBorrowingScope = 'product' | 'all';

export interface AgingAction {
  type: AgingActionType;
  config: Record<string, unknown>;
  /**
   * S17-FIX-5: optional scope for SUSPEND_BORROWING actions.
   * `'product'` (default) — suspends only subscriptions for the
   * product that triggered the aging transition.
   * `'all'` — suspends all active subscriptions for the customer
   * (the previous blanket behaviour, now opt-in).
   */
  scope?: SuspendBorrowingScope;
}

/**
 * Sprint 16 (S16-12) — execute the configured action matrix for a
 * bucket transition.
 *
 * Called from `AgingService.classifyPortfolio()` when a contract
 * transitions to a new aging bucket. The bucket's `actions` JSON is
 * iterated; each action is dispatched to its handler. **Per-action
 * errors are swallowed and logged** so one broken action (e.g. a
 * misconfigured notification template) cannot block the rest of the
 * matrix — important when a bucket has both a SEND_NOTIFICATION and
 * a SUSPEND_BORROWING, and the suspension is the more critical action.
 *
 * Three of the five handlers are concretely implemented:
 *   - SUSPEND_BORROWING: writes directly to subscriptions
 *   - SEND_NOTIFICATION + ESCALATE_TO_COLLECTIONS: emit events for
 *     downstream services (notification-service + collections workflow)
 *   - APPLY_PENALTY: emits PENALTY_APPLIED for the existing penalty
 *     service to action
 *   - REPORT_TO_BUREAU: emits a placeholder event (Phase 5 integration
 *     service handler will subscribe)
 *
 * This keeps the action service free of cross-service dependencies —
 * it never imports NotificationService, PenaltyService, etc. The
 * event bus is the integration point.
 */
@Injectable()
export class AgingActionService {
  private readonly logger = new Logger(AgingActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventBus?: EventBusService,
  ) {}

  async executeActions(
    tenantId: string,
    contractId: string,
    customerId: string,
    bucketConfig: AgingBucketConfig,
    /**
     * S17-FIX-5: the product that triggered the aging transition. Used by
     * SUSPEND_BORROWING to scope the suspension to this product's
     * subscriptions when `action.scope === 'product'` (default).
     * Callers that don't yet pass productId can omit it — the handler
     * falls back to `'all'` scope only when productId is absent.
     */
    productId?: string,
  ): Promise<void> {
    const actions = this.parseActions(bucketConfig.actions);
    if (actions.length === 0) return;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'SEND_NOTIFICATION':
            await this.sendNotification(
              tenantId,
              contractId,
              customerId,
              action.config,
            );
            break;
          case 'APPLY_PENALTY':
            await this.applyPenalty(tenantId, contractId, action.config);
            break;
          case 'SUSPEND_BORROWING':
            // S17-FIX-5: use scope from action config; default to 'product'.
            await this.suspendBorrowing(tenantId, customerId, action.scope, productId);
            break;
          case 'ESCALATE_TO_COLLECTIONS':
            await this.escalateToCollections(
              tenantId,
              contractId,
              customerId,
              action.config,
            );
            break;
          case 'REPORT_TO_BUREAU':
            await this.reportToBureau(tenantId, contractId, action.config);
            break;
          default:
            this.logger.warn(
              `Unknown aging action type: ${(action as { type: string }).type}`,
            );
        }
      } catch (err) {
        // Best-effort isolation per CLAUDE.md "Idempotency": never let
        // one action's failure cancel the others.
        this.logger.error(
          `Aging action ${action.type} failed for contract ${contractId.slice(0, 8)}…: ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── Action handlers ───────────────────────────────────────────────

  /**
   * Emits NOTIFICATION_SENT for the notification-service to dispatch.
   * Decoupled from NotificationService directly so this module stays
   * free of cross-service deps.
   */
  private async sendNotification(
    tenantId: string,
    contractId: string,
    customerId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventBus) return;
    this.eventBus.emitAndBuild(EventType.NOTIFICATION_SENT, tenantId, {
      contractId,
      customerId,
      templateKey: String(config.templateKey ?? ''),
      channel: String(config.channel ?? 'sms'),
      source: 'aging.action',
    });
  }

  /**
   * Emits PENALTY_APPLIED for the penalty service. The actual ledger
   * + outstanding-fee update happens there — we just signal intent.
   */
  private async applyPenalty(
    tenantId: string,
    contractId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventBus) return;
    this.eventBus.emitAndBuild(EventType.PENALTY_APPLIED, tenantId, {
      contractId,
      penaltyType: String(config.penaltyType ?? 'flat'),
      amount: config.amount !== undefined ? String(config.amount) : undefined,
      rate: config.rate !== undefined ? String(config.rate) : undefined,
      source: 'aging.action',
    });
  }

  /**
   * Suspend active subscriptions for the customer.
   *
   * S17-FIX-5: scope controls which subscriptions are affected:
   *   - `'product'` (default) — suspends only subscriptions for the
   *     product that triggered the aging transition (`productId`).
   *     Requires `productId` to be passed; falls back to `'all'` scope
   *     when `productId` is absent (backward-compatible with callers that
   *     haven't yet been updated to pass the product context).
   *   - `'all'` — suspends ALL active subscriptions for the customer
   *     (previous blanket behaviour — now an explicit opt-in via the
   *     `scope: 'all'` field on the bucket config action).
   *
   * This is the only handler that mutates DB state directly — suspension
   * is synchronous so it cannot be rolled back by an event consumer failure.
   */
  private async suspendBorrowing(
    tenantId: string,
    customerId: string,
    scope: SuspendBorrowingScope = 'product',
    productId?: string,
  ): Promise<void> {
    // S17 review fix — if the action is product-scoped but the caller
    // didn't pass productId, refuse to suspend at all. Silently widening
    // to 'all' (the prior behaviour) freezes the customer's other
    // products, the opposite of what the safer default promises. The
    // aging.service caller does pass it, so this only fires for new
    // callers that haven't been updated — and we'd rather they get a
    // loud log line than a quiet over-suspension.
    if (scope === 'product' && !productId) {
      this.logger.error(
        `suspendBorrowing skipped: scope='product' but no productId provided ` +
          `(customerId=${customerId.slice(0, 8)}…). Refusing to widen to 'all'.`,
      );
      return;
    }

    const where: {
      tenantId: string;
      customerId: string;
      status: SubscriptionStatus;
      productId?: string;
    } = {
      tenantId,
      customerId,
      status: SubscriptionStatus.active,
    };

    if (scope === 'product') {
      // productId is guaranteed by the guard above.
      where.productId = productId;
    }

    await this.prisma.subscription.updateMany({
      where,
      data: { status: SubscriptionStatus.suspended },
    });

    this.logger.debug(
      `suspendBorrowing: scope=${scope} productId=${productId?.slice(0, 8) ?? 'n/a'} customerId=${customerId.slice(0, 8)}…`,
    );
  }

  private async escalateToCollections(
    tenantId: string,
    contractId: string,
    customerId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventBus) return;
    this.eventBus.emitAndBuild(EventType.COLLECTIONS_ACTION_LOGGED, tenantId, {
      contractId,
      customerId,
      action: 'ESCALATE',
      priority: String(config.priority ?? 'normal'),
      source: 'aging.action',
    });
  }

  /**
   * Phase 5 integration-service subscriber will handle the actual bureau
   * dispatch. We emit a placeholder CONTRACT_STATE_CHANGED with a
   * `bureauCode` discriminator so the consumer can filter.
   */
  private async reportToBureau(
    tenantId: string,
    contractId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventBus) return;
    this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
      contractId,
      action: 'REPORT_TO_BUREAU',
      bureauCode: String(config.bureauCode ?? 'default'),
      source: 'aging.action',
    });
  }

  /**
   * Defensive parse — JSONB column can hold anything. Skips entries
   * that don't have a recognised `type` so a hand-edited config row
   * never crashes the aging job.
   *
   * S17-FIX-5: also extracts the optional `scope` field for
   * SUSPEND_BORROWING actions. Unrecognised scope values are ignored
   * and the default ('product') applies.
   */
  private parseActions(raw: unknown): AgingAction[] {
    if (!Array.isArray(raw)) return [];
    const validTypes = new Set<AgingActionType>([
      'SEND_NOTIFICATION',
      'APPLY_PENALTY',
      'SUSPEND_BORROWING',
      'ESCALATE_TO_COLLECTIONS',
      'REPORT_TO_BUREAU',
    ]);
    const validScopes = new Set<SuspendBorrowingScope>(['product', 'all']);
    return raw
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .filter((a) => validTypes.has(a.type as AgingActionType))
      .map((a) => {
        const rawScope = a.scope as string | undefined;
        const scope: SuspendBorrowingScope | undefined =
          rawScope && validScopes.has(rawScope as SuspendBorrowingScope)
            ? (rawScope as SuspendBorrowingScope)
            : undefined;
        return {
          type: a.type as AgingActionType,
          config: (a.config as Record<string, unknown>) ?? {},
          scope,
        };
      });
  }
}
