import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { compare } from '@lons/common';
import { REDIS_CLIENT } from '@lons/common';
import type Redis from 'ioredis';

/**
 * Sprint 18 — S18-6 (FR-AE-002.4).
 *
 * Per-operator approval-authority limits. Without these, any user with
 * the `loan_request:approve` permission can approve a loan of any size,
 * for any product, on any escalated request. This service caps the
 * blast radius by checking four dimensions on every approval action:
 *
 *   1. Amount ceiling (Decimal compare — never numeric)
 *   2. Daily approval count (Redis counter with midnight TTL)
 *   3. Allowed product types (JSON array; null = all allowed)
 *   4. Authorization to approve escalated requests
 *
 * Backward compatibility: when no row exists in `operator_approval_limits`
 * for an operator, `validateOperatorAction` returns without throwing.
 * This preserves the existing behaviour for operators provisioned before
 * Sprint 18 — the admin must explicitly assign limits via the admin
 * portal (Track A).
 *
 * Track A injects this service via `@Optional()` in the GraphQL resolvers
 * for loan approval mutations. The class is exported from the
 * process-engine barrel so Track A's `@lons/process-engine` import path
 * resolves cleanly.
 */

export interface SetApprovalLimitsInput {
  /** Decimal string — see MoneyString in @lons/shared-types. */
  maxApprovalAmount: string;
  maxApprovalsPerDay?: number | null;
  allowedProductTypes?: string[] | null;
  canApproveEscalated?: boolean;
  isActive?: boolean;
}

export type ApprovalAction = 'approve' | 'reject' | 'escalate';

/**
 * Shape this service needs from a loan request to do its job. We keep it
 * deliberately narrow so callers don't have to pull a full LoanRequest
 * with all relations just to validate authority.
 */
export interface ApprovalLimitLoanRequestView {
  /** Decimal-typed amount (Prisma.Decimal or string-coercible) */
  requestedAmount: { toString(): string } | string;
  product: { productType?: string; type?: string };
  status: string;
}

@Injectable()
export class ApprovalLimitService {
  private readonly logger = new Logger(ApprovalLimitService.name);

  // Cache TTL for the limits row itself (5 min). Daily counter has its
  // own 24h TTL handled separately.
  private static readonly LIMITS_CACHE_TTL_SECONDS = 300;
  private static readonly DAILY_COUNTER_TTL_SECONDS = 86400;

  constructor(
    private prisma: PrismaService,
    // @Optional() so unit tests can construct without Redis. When absent
    // we degrade to direct DB reads and skip the counter increment — the
    // amount/product/escalation checks still run.
    @Optional() @Inject(REDIS_CLIENT) private redis?: Redis,
  ) {}

  /**
   * Validate that an operator is authorised to perform `action` on the
   * given loan request. Throws ForbiddenException with a structured
   * `code` payload if any limit is exceeded — the GraphQL filter
   * surfaces the code unchanged to the admin portal.
   *
   * No-op (returns void) when:
   *   - No limits row configured for the operator (backward compat)
   *   - Action is `reject` or `escalate` (only `approve` consumes limits)
   */
  async validateOperatorAction(
    tenantId: string,
    operatorId: string,
    action: ApprovalAction,
    loanRequest: ApprovalLimitLoanRequestView,
  ): Promise<void> {
    const limits = await this.getOperatorLimits(tenantId, operatorId);
    if (!limits) return;

    if (!limits.isActive) {
      throw new ForbiddenException({
        code: 'OPERATOR_SUSPENDED',
        message: 'Operator approval privileges are suspended',
      });
    }

    // Only `approve` consumes the four-dimension limits. Reject/escalate
    // are intentionally unrestricted — those are safety actions and
    // we don't want to lock an operator out of declining a bad loan.
    if (action !== 'approve') return;

    const requestedAmountStr =
      typeof loanRequest.requestedAmount === 'string'
        ? loanRequest.requestedAmount
        : loanRequest.requestedAmount.toString();
    const maxAmountStr = limits.maxApprovalAmount.toString();

    if (compare(requestedAmountStr, maxAmountStr) > 0) {
      throw new ForbiddenException({
        code: 'APPROVAL_LIMIT_EXCEEDED',
        message: `Loan amount ${requestedAmountStr} exceeds your approval limit of ${maxAmountStr}`,
        maxApprovalAmount: maxAmountStr,
      });
    }

    if (limits.maxApprovalsPerDay != null) {
      const todayCount = await this.getTodayApprovalCount(
        tenantId,
        operatorId,
      );
      if (todayCount >= limits.maxApprovalsPerDay) {
        throw new ForbiddenException({
          code: 'DAILY_APPROVAL_LIMIT_REACHED',
          message: `Daily approval limit of ${limits.maxApprovalsPerDay} reached`,
          maxApprovalsPerDay: limits.maxApprovalsPerDay,
        });
      }
    }

    if (limits.allowedProductTypes) {
      const allowed = limits.allowedProductTypes as string[];
      // Support both `productType` and Prisma `type` field naming.
      const productType =
        loanRequest.product.productType ?? loanRequest.product.type;
      if (productType && !allowed.includes(productType)) {
        throw new ForbiddenException({
          code: 'PRODUCT_TYPE_NOT_ALLOWED',
          message: `You are not authorised to approve ${productType} loans`,
          productType,
          allowedProductTypes: allowed,
        });
      }
    }

    if (loanRequest.status === 'escalated' && !limits.canApproveEscalated) {
      throw new ForbiddenException({
        code: 'CANNOT_APPROVE_ESCALATED',
        message: 'You are not authorised to approve escalated loan requests',
      });
    }
  }

  /**
   * Fetch the operator's limits row. Cached in Redis for 5 minutes; on
   * miss falls through to Postgres. When Redis is down we degrade
   * silently and read from DB — better a slow check than no check.
   */
  async getOperatorLimits(tenantId: string, operatorId: string) {
    const cacheKey = this.limitsCacheKey(tenantId, operatorId);

    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as Awaited<
            ReturnType<typeof this.prisma.operatorApprovalLimit.findUnique>
          >;
        }
      } catch (err) {
        this.logger.warn(
          `Redis read failed for approval limits cache; falling through to DB: ${(err as Error).message}`,
        );
      }
    }

    const row = await this.prisma.operatorApprovalLimit.findUnique({
      where: { tenantId_userId: { tenantId, userId: operatorId } },
    });

    if (row && this.redis) {
      try {
        await this.redis.set(
          cacheKey,
          JSON.stringify(row),
          'EX',
          ApprovalLimitService.LIMITS_CACHE_TTL_SECONDS,
        );
      } catch (err) {
        // Cache write failures are non-fatal.
        this.logger.warn(
          `Redis write failed for approval limits cache: ${(err as Error).message}`,
        );
      }
    }
    return row;
  }

  /**
   * Today's approval count for this operator. Backed by a Redis counter
   * with midnight expiry — the DB fallback is the source of truth on
   * cache miss / Redis outage.
   */
  private async getTodayApprovalCount(
    tenantId: string,
    operatorId: string,
  ): Promise<number> {
    const today = ApprovalLimitService.todayKey();
    const counterKey = this.counterCacheKey(tenantId, operatorId, today);

    if (this.redis) {
      try {
        const cached = await this.redis.get(counterKey);
        if (cached !== null) return parseInt(cached, 10);
      } catch (err) {
        this.logger.warn(
          `Redis read failed for daily counter; falling through to DB: ${(err as Error).message}`,
        );
      }
    }

    const startOfDay = new Date(`${today}T00:00:00.000Z`);
    const endOfDay = new Date(`${today}T23:59:59.999Z`);

    const dbCount = await this.prisma.loanRequest.count({
      where: {
        tenantId,
        status: {
          in: [
            'approved',
            'offer_sent',
            'accepted',
            'disbursing',
            'disbursed',
          ],
        },
        // The reviewer is stamped onto metadata when the approval lands
        // — see ApprovalService.approveManual wiring in this sprint.
        metadata: { path: ['reviewedBy'], equals: operatorId } as never,
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (this.redis) {
      try {
        await this.redis.set(
          counterKey,
          String(dbCount),
          'EX',
          ApprovalLimitService.DAILY_COUNTER_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.warn(
          `Redis write failed for daily counter: ${(err as Error).message}`,
        );
      }
    }
    return dbCount;
  }

  /**
   * Increment the daily counter after a successful approval. Call this
   * from the approval flow after `transitionStatus(...approved)` lands.
   * Sets the 24h TTL only on first increment (key was absent).
   */
  async incrementDailyCount(
    tenantId: string,
    operatorId: string,
  ): Promise<void> {
    if (!this.redis) return;
    const today = ApprovalLimitService.todayKey();
    const counterKey = this.counterCacheKey(tenantId, operatorId, today);
    try {
      const next = await this.redis.incr(counterKey);
      // On first increment the TTL is -1 (no expiry); set it then.
      if (next === 1) {
        await this.redis.expire(
          counterKey,
          ApprovalLimitService.DAILY_COUNTER_TTL_SECONDS,
        );
      } else {
        const ttl = await this.redis.ttl(counterKey);
        if (ttl < 0) {
          await this.redis.expire(
            counterKey,
            ApprovalLimitService.DAILY_COUNTER_TTL_SECONDS,
          );
        }
      }
    } catch (err) {
      // Don't let a Redis hiccup roll back the approval.
      this.logger.warn(
        `Redis increment failed for daily counter: ${(err as Error).message}`,
      );
    }
  }

  // --- CRUD (admin) ---

  async setLimits(
    tenantId: string,
    userId: string,
    input: SetApprovalLimitsInput,
  ) {
    const result = await this.prisma.operatorApprovalLimit.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        maxApprovalAmount: input.maxApprovalAmount,
        maxApprovalsPerDay: input.maxApprovalsPerDay ?? null,
        allowedProductTypes:
          input.allowedProductTypes === undefined
            ? undefined
            : (input.allowedProductTypes as unknown as object),
        canApproveEscalated: input.canApproveEscalated ?? false,
        isActive: input.isActive ?? true,
      },
      update: {
        maxApprovalAmount: input.maxApprovalAmount,
        ...(input.maxApprovalsPerDay !== undefined && {
          maxApprovalsPerDay: input.maxApprovalsPerDay,
        }),
        ...(input.allowedProductTypes !== undefined && {
          allowedProductTypes:
            input.allowedProductTypes as unknown as object,
        }),
        ...(input.canApproveEscalated !== undefined && {
          canApproveEscalated: input.canApproveEscalated,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    await this.invalidateCache(tenantId, userId);
    return result;
  }

  async getLimitsForTenant(tenantId: string) {
    return this.prisma.operatorApprovalLimit.findMany({
      where: { tenantId },
      include: {
        // The User model uses `name`, not `fullName`. The admin portal
        // resolver maps this to a `fullName` field on the GraphQL type.
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  /**
   * Public so admin mutations + tests can force-invalidate after an
   * out-of-band change (e.g. a user is suspended via a different path).
   */
  async invalidateCache(tenantId: string, operatorId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.limitsCacheKey(tenantId, operatorId));
    } catch (err) {
      this.logger.warn(
        `Redis del failed for approval limits cache: ${(err as Error).message}`,
      );
    }
  }

  // --- key helpers ---

  private limitsCacheKey(tenantId: string, operatorId: string): string {
    return `approval_limits:${tenantId}:${operatorId}`;
  }

  private counterCacheKey(
    tenantId: string,
    operatorId: string,
    isoDay: string,
  ): string {
    return `approval_count:${tenantId}:${operatorId}:${isoDay}`;
  }

  /** YYYY-MM-DD in UTC. Date math is UTC-based to keep the midnight
   * roll consistent across tenants in different time zones. */
  private static todayKey(now: Date = new Date()): string {
    return now.toISOString().split('T')[0];
  }
}
