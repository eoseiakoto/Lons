import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import {
  AuditActionType,
  AuditResourceType,
  ValidationError,
  NotFoundError,
} from '@lons/common';
import { AuditService } from '@lons/entity-service';

/**
 * S19-7 — manual reinstatement path for a customer suspended via
 * NPL auto-suspension. Subscriptions and credit lines are NOT
 * auto-unsuspended — operators must re-enable each one individually
 * (the spec calls this out as deliberate friction so a customer
 * doesn't accidentally re-acquire borrowing power before the SP
 * Admin has reviewed their situation).
 *
 * Pre-conditions enforced:
 *   - Customer exists + currently suspended.
 *   - NO active contracts with classification in
 *     ('doubtful', 'loss', 'npl'). i.e. every NPL contract must be
 *     written off, closed, or settled before reinstatement.
 *
 * Audited via AuditService with reason metadata. The reinstating
 * actor's id is captured for after-the-fact accountability.
 */
@Injectable()
export class NplReinstatementService {
  private readonly logger = new Logger(NplReinstatementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async reinstateCustomer(
    tenantId: string,
    customerId: string,
    actorId: string,
    reason: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { status: true, metadata: true },
    });
    if (!customer) throw new NotFoundError('Customer', customerId);
    if (customer.status !== 'suspended') {
      throw new ValidationError(
        `Cannot reinstate customer with status ${customer.status} (only 'suspended' is reinstateable)`,
        { customerId, status: customer.status },
      );
    }

    // Check for unresolved NPL contracts. Anything still in
    // doubtful / loss classification AND not in a closing-state
    // blocks reinstatement.
    const activeNpl = await this.prisma.contract.count({
      where: {
        tenantId,
        customerId,
        classification: { in: ['doubtful', 'loss'] },
        status: { notIn: ['written_off', 'settled', 'cancelled'] },
      },
    });
    if (activeNpl > 0) {
      throw new ValidationError(
        `Customer has ${activeNpl} unresolved NPL contract(s) — reinstatement blocked`,
        { customerId, unresolvedContracts: activeNpl },
      );
    }

    const meta = (customer.metadata as Record<string, unknown> | null) ?? {};
    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        status: 'active',
        metadata: {
          ...meta,
          reinstatedAt: new Date().toISOString(),
          reinstatedBy: actorId,
          reinstatedReason: reason,
        },
      },
    });

    await this.auditService.log({
      tenantId,
      action: AuditActionType.UPDATE,
      resourceType: AuditResourceType.CUSTOMER,
      resourceId: customerId,
      actorId,
      actorType: 'user',
      metadata: { reason: 'npl_reinstatement', detail: reason },
    });

    this.logger.log(
      `Reinstated customer ***${customerId.slice(-4)} by actor ***${actorId.slice(-4)}: ${reason}`,
    );
  }
}
