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

export interface AgingAction {
  type: AgingActionType;
  config: Record<string, unknown>;
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
            await this.suspendBorrowing(tenantId, customerId);
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
   * Hard-suspend ALL active subscriptions for the customer. This is
   * the only handler that mutates DB state directly — suspension is
   * synchronous (cannot be undone by an event consumer failure).
   */
  private async suspendBorrowing(
    tenantId: string,
    customerId: string,
  ): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: {
        tenantId,
        customerId,
        status: SubscriptionStatus.active,
      },
      data: { status: SubscriptionStatus.suspended },
    });
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
    return raw
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .filter((a) => validTypes.has(a.type as AgingActionType))
      .map((a) => ({
        type: a.type as AgingActionType,
        config: (a.config as Record<string, unknown>) ?? {},
      }));
  }
}
