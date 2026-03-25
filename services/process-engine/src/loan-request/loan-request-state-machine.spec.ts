import { LoanRequestStatus } from '@lons/database';

import { isValidTransition, getValidNextStatuses } from './loan-request-state-machine';

describe('LoanRequestStateMachine', () => {
  describe('isValidTransition', () => {
    it('should allow received -> validated', () => {
      expect(isValidTransition(LoanRequestStatus.received, LoanRequestStatus.validated)).toBe(true);
    });

    it('should allow received -> rejected', () => {
      expect(isValidTransition(LoanRequestStatus.received, LoanRequestStatus.rejected)).toBe(true);
    });

    it('should not allow received -> approved', () => {
      expect(isValidTransition(LoanRequestStatus.received, LoanRequestStatus.approved)).toBe(false);
    });

    it('should allow scored -> approved', () => {
      expect(isValidTransition(LoanRequestStatus.scored, LoanRequestStatus.approved)).toBe(true);
    });

    it('should allow scored -> manual_review', () => {
      expect(isValidTransition(LoanRequestStatus.scored, LoanRequestStatus.manual_review)).toBe(true);
    });

    it('should allow offer_sent -> accepted', () => {
      expect(isValidTransition(LoanRequestStatus.offer_sent, LoanRequestStatus.accepted)).toBe(true);
    });

    it('should allow offer_sent -> expired', () => {
      expect(isValidTransition(LoanRequestStatus.offer_sent, LoanRequestStatus.expired)).toBe(true);
    });

    it('should allow disbursement_failed -> disbursing (retry)', () => {
      expect(isValidTransition(LoanRequestStatus.disbursement_failed, LoanRequestStatus.disbursing)).toBe(true);
    });

    it('should not allow disbursed -> any transition', () => {
      expect(getValidNextStatuses(LoanRequestStatus.disbursed)).toEqual([]);
    });

    it('should return false for unknown status', () => {
      expect(isValidTransition('unknown', LoanRequestStatus.validated)).toBe(false);
    });
  });

  describe('getValidNextStatuses', () => {
    it('should return valid next statuses for received', () => {
      const next = getValidNextStatuses(LoanRequestStatus.received);
      expect(next).toContain(LoanRequestStatus.validated);
      expect(next).toContain(LoanRequestStatus.rejected);
      expect(next).toContain(LoanRequestStatus.cancelled);
    });

    it('should return empty array for terminal states', () => {
      expect(getValidNextStatuses(LoanRequestStatus.disbursed)).toEqual([]);
      expect(getValidNextStatuses(LoanRequestStatus.rejected)).toBeUndefined;
    });
  });
});
