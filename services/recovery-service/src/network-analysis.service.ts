import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '@lons/common';

export interface GuarantorCandidate {
  customerId: string;
  name: string;
  tieStrength: number; // 0-1
  relationshipType: string;
  financialCapacityScore: number; // 0-100
}

/**
 * Network Analysis Service (STUB/MOCK)
 *
 * This is a placeholder for future social graph traversal implementation.
 * Currently returns simulated guarantor candidates.
 * The interface is designed to be compatible with the future real implementation.
 */
@Injectable()
export class NetworkAnalysisService {
  private readonly logger = new Logger('NetworkAnalysisService');

  async findGuarantorCandidates(
    tenantId: string,
    customerId: string,
  ): Promise<GuarantorCandidate[]> {
    this.logger.debug(
      `Finding guarantor candidates for customer ${customerId} in tenant ${tenantId} (mock)`,
    );

    // Return mock data simulating 3 guarantor candidates
    // In the real implementation, this would perform social graph traversal
    // across transaction networks, shared employer data, and known relationships
    const mockCandidates: GuarantorCandidate[] = [
      {
        customerId: `mock-guarantor-001-${customerId.slice(0, 8)}`,
        name: 'Mock Guarantor A',
        tieStrength: 0.85,
        relationshipType: 'family',
        financialCapacityScore: 72,
      },
      {
        customerId: `mock-guarantor-002-${customerId.slice(0, 8)}`,
        name: 'Mock Guarantor B',
        tieStrength: 0.65,
        relationshipType: 'colleague',
        financialCapacityScore: 58,
      },
      {
        customerId: `mock-guarantor-003-${customerId.slice(0, 8)}`,
        name: 'Mock Guarantor C',
        tieStrength: 0.45,
        relationshipType: 'business_partner',
        financialCapacityScore: 81,
      },
    ];

    return mockCandidates;
  }
}
