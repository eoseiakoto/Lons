import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';

import { PrismaService } from '@lons/database';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { MicroLoanCreditLimitAuditService } from '@lons/process-engine';

import {
  MicroLoanCreditLimitChangeConnection,
  MicroLoanCreditLimitChangeEdge,
  MicroLoanCreditLimitChangeType,
} from '../types/micro-loan.type';

/**
 * Sprint 16 (S16-6) — GraphQL surface for the micro-loan credit limit
 * audit trail.
 *
 * Single read-only query: `creditLimitHistory(customerId, subscriptionId?, first, after)`.
 * Returns a Relay-style cursor connection of append-only audit rows
 * newest-first. Restricted to `admin` and `operator` roles — collections
 * staff and customer-facing users see no credit-limit history.
 *
 * No mutations here — credit-limit changes are emitted by the
 * background services (S16-4 review, S16-5 default) and recorded
 * server-side. Operators with a need to override the automated path
 * would do so via the existing operator override flow + an audit row
 * stamped `triggeredBy: 'manual:<userId>'`.
 */
@Resolver(() => MicroLoanCreditLimitChangeType)
export class MicroLoanResolver {
  constructor(
    private readonly auditService: MicroLoanCreditLimitAuditService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => MicroLoanCreditLimitChangeConnection)
  @Roles('admin', 'operator')
  async creditLimitHistory(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('subscriptionId', { type: () => ID, nullable: true })
    subscriptionId?: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<MicroLoanCreditLimitChangeConnection> {
    const take = Math.min(first ?? 25, 100);
    // Run the count under the same RLS context as the page query.
    // `totalCount` is exact for the same filter; the service caps `take`.
    const rows = await this.auditService.list(
      tenantId,
      { customerId, subscriptionId },
      { take, cursor: after },
    );
    const totalCount = await this.prisma.microLoanCreditLimitChange.count({
      where: {
        tenantId,
        customerId,
        ...(subscriptionId && { subscriptionId }),
      },
    });

    const hasNextPage = rows.length > take;
    const trimmed = hasNextPage ? rows.slice(0, -1) : rows;
    const edges: MicroLoanCreditLimitChangeEdge[] = trimmed.map((row) => ({
      cursor: row.id,
      node: row as unknown as MicroLoanCreditLimitChangeType,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : undefined,
      },
      totalCount,
    };
  }
}
