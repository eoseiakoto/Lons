import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { EventBusService, NotFoundError, isPositive } from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Contract statuses that block anonymization — the customer still has
 * an active lending relationship with one of these states.
 */
const BLOCKING_CONTRACT_STATUSES: Prisma.EnumContractStatusFilter['in'] = [
  'active',
  'performing',
  'due',
  'overdue',
  'delinquent',
  'cooling_off',
];

export interface AnonymizationEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export interface AnonymizationResult {
  success: boolean;
  customerId: string;
  anonymizedAt?: string;
  errors: AnonymizationError[];
}

export interface AnonymizationError {
  code: string;
  message: string;
  blockingResource?: string;
}

@Injectable()
export class AnonymizationService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  /**
   * Check whether a customer is eligible for anonymization.
   * Returns a list of reasons if the customer is NOT eligible.
   */
  async checkEligibility(
    tenantId: string,
    customerId: string,
  ): Promise<AnonymizationEligibilityResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundError('Customer', customerId);
    }

    const reasons: string[] = [];

    // 1. Already anonymized
    if (customer.status === 'anonymized') {
      reasons.push('Customer data has already been anonymized');
      return { eligible: false, reasons };
    }

    // 2. Check for active/blocking contracts
    const blockingContracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        customerId,
        status: { in: BLOCKING_CONTRACT_STATUSES },
      },
      select: { id: true, contractNumber: true, status: true, totalOutstanding: true },
    });

    if (blockingContracts.length > 0) {
      for (const contract of blockingContracts) {
        reasons.push(
          `Active contract ${contract.contractNumber} (status: ${contract.status})`,
        );
      }
    }

    // 3. Check for outstanding balance across all contracts
    const contractsWithBalance = await this.prisma.contract.findMany({
      where: {
        tenantId,
        customerId,
        totalOutstanding: { gt: 0 },
      },
      select: { id: true, contractNumber: true, totalOutstanding: true },
    });

    for (const contract of contractsWithBalance) {
      const outstanding = String(contract.totalOutstanding);
      if (isPositive(outstanding)) {
        // Only add if not already captured by blocking status check
        const alreadyReported = blockingContracts.some((bc) => bc.id === contract.id);
        if (!alreadyReported) {
          reasons.push(
            `Contract ${contract.contractNumber} has outstanding balance of ${contract.totalOutstanding}`,
          );
        }
      }
    }

    // Check: consent recorded in metadata
    const metadata = (customer.metadata as Record<string, any>) || {};
    if (!metadata.anonymizationConsent && !metadata.deletionRequested) {
      reasons.push('Customer has not explicitly consented to data deletion');
    }

    // Check: no pending screening reviews
    const pendingScreenings = await this.prisma.screeningResult.count({
      where: {
        tenantId,
        customerId,
        status: 'POTENTIAL_MATCH',
        reviewedAt: null,
      },
    });
    if (pendingScreenings > 0) {
      reasons.push(`Customer has ${pendingScreenings} pending screening review(s)`);
    }

    return { eligible: reasons.length === 0, reasons };
  }

  /**
   * Anonymize all PII fields for a customer.
   * Preserves: id, tenantId, createdAt, updatedAt, kycLevel, and financial records.
   */
  async anonymizeCustomer(
    tenantId: string,
    customerId: string,
    requestedBy: string,
    idempotencyKey?: string,
  ): Promise<AnonymizationResult> {
    // Idempotency check — if already anonymized, return existing result
    if (idempotencyKey) {
      const existingCustomer = await this.prisma.customer.findFirst({
        where: { id: customerId, tenantId, status: 'anonymized' },
      });
      if (existingCustomer) {
        return {
          success: true,
          customerId,
          anonymizedAt: existingCustomer.anonymizedAt?.toISOString(),
          errors: [],
        };
      }
    }

    // Emit requested event
    this.eventBus.emitAndBuild(
      EventType.CUSTOMER_ANONYMIZATION_REQUESTED,
      tenantId,
      { customerId, requestedBy },
    );

    // Run eligibility check
    const eligibility = await this.checkEligibility(tenantId, customerId);

    if (!eligibility.eligible) {
      const errors: AnonymizationError[] = eligibility.reasons.map((reason) => ({
        code: 'ANONYMIZATION_BLOCKED',
        message: reason,
        blockingResource: reason,
      }));

      this.eventBus.emitAndBuild(
        EventType.CUSTOMER_ANONYMIZATION_BLOCKED,
        tenantId,
        { customerId, requestedBy, reasons: eligibility.reasons },
      );

      return {
        success: false,
        customerId,
        anonymizedAt: undefined,
        errors,
      };
    }

    // Perform anonymization
    const idPrefix = customerId.substring(0, 6);
    const anonymizedAt = new Date();

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        fullName: `ANON-${idPrefix}`,
        email: `anon-${idPrefix}@anonymized.local`,
        phonePrimary: '+000000000000',
        phoneSecondary: '+000000000000',
        nationalId: `ANON-NID-${idPrefix}`,
        dateOfBirth: new Date('1900-01-01'),
        metadata: { anonymized: true, anonymizedAt: anonymizedAt.toISOString() },
        status: 'anonymized',
        anonymizedAt,
        anonymizedBy: requestedBy,
        blacklistReason: null,
        region: null,
        city: null,
      },
    });

    this.eventBus.emitAndBuild(
      EventType.CUSTOMER_ANONYMIZATION_COMPLETED,
      tenantId,
      { customerId, requestedBy, anonymizedAt: anonymizedAt.toISOString() },
    );

    return {
      success: true,
      customerId,
      anonymizedAt: anonymizedAt.toISOString(),
      errors: [],
    };
  }
}
