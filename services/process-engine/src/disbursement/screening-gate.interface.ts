/**
 * Screening Gate Interface
 *
 * Defines the minimal screening contract needed by DisbursementService.
 * The actual implementation (ScreeningService from integration-service) is
 * wired at the application composition root (graphql-server/app.module)
 * to avoid a circular package dependency between process-engine and
 * integration-service.
 */

export interface IScreeningGateResult {
  status: 'CLEAR' | 'MATCH' | 'POTENTIAL_MATCH' | 'ERROR';
  screeningId: string;
}

export interface IScreeningGate {
  screenCustomer(tenantId: string, customerId: string): Promise<IScreeningGateResult>;
}

export const SCREENING_GATE = 'SCREENING_GATE';
