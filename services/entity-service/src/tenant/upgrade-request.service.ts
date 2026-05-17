import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService, PlanTier } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Sprint 18 (S18-11) — tenant-initiated plan tier upgrade requests.
 *
 * Tenants on starter / growth can request a move up the tier ladder.
 * Downgrade / same-tier requests are rejected. Each request is stored
 * with status `pending` and an emitted `PLAN_UPGRADE_REQUESTED` event
 * so the platform team's CRM / Slack integration can pick it up.
 *
 * Approval is out of scope for this sprint — platform operators
 * change the tenant.planTier directly via the platform admin portal.
 * The `status` column lets us track which requests have been actioned.
 */

// Tier ordering: starter (0) < growth (1) < enterprise (2). Mirrors
// the PlanTier enum order in schema.prisma — keep these in sync.
const TIER_ORDER: Record<string, number> = {
  starter: 0,
  growth: 1,
  enterprise: 2,
};

@Injectable()
export class UpgradeRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async requestUpgrade(
    tenantId: string,
    input: {
      targetTier: PlanTier;
      reason?: string;
      requestedBy?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { planTier: true },
    });

    const currentOrder = TIER_ORDER[tenant.planTier];
    const targetOrder = TIER_ORDER[input.targetTier];

    if (targetOrder == null) {
      throw new BadRequestException({
        code: 'INVALID_TARGET_TIER',
        message: `Unknown plan tier: ${input.targetTier}`,
      });
    }
    if (targetOrder <= currentOrder) {
      throw new BadRequestException({
        code: 'INVALID_TIER_TRANSITION',
        message: `Target tier ${input.targetTier} must be higher than current tier ${tenant.planTier}`,
      });
    }

    // Idempotency: if there's already a pending request for the same
    // (tenant, target tier) pair, return it instead of creating a
    // duplicate. Tenants spam the button when nothing visibly happens.
    //
    // S18 code-review fix I3 — the pre-fix find-then-create was a
    // TOCTOU race: two concurrent clicks both passed the lookup and
    // both wrote a row. The migration adds a partial unique index
    // upgrade_requests_pending_one_per_tier covering
    // (tenant_id, requested_tier) WHERE status = 'pending', so a
    // racing insert raises P2002; we catch it and re-read.
    const existing = await this.prisma.upgradeRequest.findFirst({
      where: { tenantId, requestedTier: input.targetTier, status: 'pending' },
    });
    if (existing) return existing;

    let request;
    try {
      request = await this.prisma.upgradeRequest.create({
        data: {
          tenantId,
          currentTier: tenant.planTier,
          requestedTier: input.targetTier,
          reason: input.reason,
          status: 'pending',
          requestedBy: input.requestedBy,
        },
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation on the partial index →
      // a concurrent click won. Re-read and return that row.
      if ((err as { code?: string })?.code === 'P2002') {
        const winner = await this.prisma.upgradeRequest.findFirst({
          where: { tenantId, requestedTier: input.targetTier, status: 'pending' },
        });
        if (winner) return winner;
      }
      throw err;
    }

    this.eventBus.emitAndBuild(EventType.PLAN_UPGRADE_REQUESTED, tenantId, {
      requestId: request.id,
      currentTier: tenant.planTier,
      requestedTier: input.targetTier,
      reason: input.reason,
      requestedBy: input.requestedBy,
    });

    return request;
  }

  async listForTenant(tenantId: string) {
    return this.prisma.upgradeRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(tenantId: string, requestId: string) {
    return this.prisma.upgradeRequest.findFirst({
      where: { id: requestId, tenantId },
    });
  }
}
