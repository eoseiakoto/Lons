import { LoanRequestStatus } from '@lons/database';

const VALID_TRANSITIONS: Record<string, string[]> = {
  [LoanRequestStatus.received]: [LoanRequestStatus.validated, LoanRequestStatus.rejected, LoanRequestStatus.cancelled],
  [LoanRequestStatus.validated]: [LoanRequestStatus.pre_qualified, LoanRequestStatus.rejected],
  [LoanRequestStatus.pre_qualified]: [LoanRequestStatus.scored, LoanRequestStatus.rejected],
  [LoanRequestStatus.scored]: [LoanRequestStatus.approved, LoanRequestStatus.rejected, LoanRequestStatus.manual_review],
  [LoanRequestStatus.approved]: [LoanRequestStatus.offer_sent],
  [LoanRequestStatus.manual_review]: [LoanRequestStatus.approved, LoanRequestStatus.rejected],
  [LoanRequestStatus.offer_sent]: [LoanRequestStatus.accepted, LoanRequestStatus.declined, LoanRequestStatus.expired],
  [LoanRequestStatus.accepted]: [LoanRequestStatus.contract_created],
  [LoanRequestStatus.contract_created]: [LoanRequestStatus.disbursing],
  [LoanRequestStatus.disbursing]: [LoanRequestStatus.disbursed, LoanRequestStatus.disbursement_failed],
  [LoanRequestStatus.disbursement_failed]: [LoanRequestStatus.disbursing, LoanRequestStatus.cancelled],
};

export function isValidTransition(currentStatus: string, targetStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(targetStatus);
}

export function getValidNextStatuses(currentStatus: string): string[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}
