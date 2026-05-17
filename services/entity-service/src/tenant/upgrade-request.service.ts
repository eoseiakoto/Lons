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
    const existing = await this.prisma.upgradeRequest.findFirst({
      where: { tenantId, requestedTier: input.targetTier, status: 'pending' },
    });
    if (existing) return existing;

    const request = await this.prisma.upgradeRequest.create({
      data: {
        tenantId,
        currentTier: tenant.planTier,
        requestedTier: input.targetTier,
        reason: input.reason,
        status: 'pending',
        requestedBy: input.requestedBy,
      },
    });

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
