import { MfaComplianceService } from './mfa-compliance.service';

/**
 * S19-STAB-5 — policy-lock unit tests for the MFA tier enforcement
 * compliance service. The service is pure (no IO, no DB) so every
 * branch can be exercised with explicit inputs and a fixed `now`.
 *
 * Scenarios covered:
 *
 *   - Starter tier: never required, regardless of role / enrol state.
 *   - Growth tier: required only for SP Admin; SP Operator etc. fall
 *     through to "not_required".
 *   - Enterprise tier: required for every SP role.
 *   - Grace start = later(tenantPlanTierChangedAt, userCreatedAt,
 *     userMfaDisabledAt).
 *   - 7-day window: `pending` while remaining > 0, `overdue` after.
 *   - `graceDaysRemaining` rounds DOWN (floor) — 0 means "today is
 *     the last day".
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('MfaComplianceService.computeStatus', () => {
  let service: MfaComplianceService;

  beforeEach(() => {
    service = new MfaComplianceService();
  });

  describe('starter tier', () => {
    it('returns not_required for SP Admin', () => {
      const result = service.computeStatus({
        planTier: 'starter',
        tenantPlanTierChangedAt: new Date('2026-01-01'),
        tenantCreatedAt: new Date('2026-01-01'),
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: new Date('2026-01-01'),
        userMfaDisabledAt: null,
      });
      expect(result.status).toBe('not_required');
      expect(result.graceDaysRemaining).toBeNull();
      expect(result.graceEndsAt).toBeNull();
    });

    it('returns not_required even if MFA is enabled (consistency)', () => {
      const result = service.computeStatus({
        planTier: 'starter',
        tenantPlanTierChangedAt: new Date('2026-01-01'),
        tenantCreatedAt: new Date('2026-01-01'),
        roleName: 'SP Admin',
        userMfaEnabled: true,
        userCreatedAt: new Date('2026-01-01'),
        userMfaDisabledAt: null,
      });
      expect(result.status).toBe('not_required');
    });
  });

  describe('growth tier', () => {
    it('requires MFA for SP Admin', () => {
      const tierStart = new Date('2026-05-20T00:00:00Z');
      const now = new Date('2026-05-23T00:00:00Z'); // 3 days in
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: tierStart,
        tenantCreatedAt: tierStart,
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: new Date('2026-01-01'),
        userMfaDisabledAt: null,
        now,
      });
      expect(result.status).toBe('pending');
      // 3 days elapsed of a 7-day window → 4 days remaining.
      expect(result.graceDaysRemaining).toBe(4);
    });

    it('does NOT require MFA for SP Operator on growth', () => {
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: new Date('2026-01-01'),
        tenantCreatedAt: new Date('2026-01-01'),
        roleName: 'SP Operator',
        userMfaEnabled: false,
        userCreatedAt: new Date('2026-01-01'),
        userMfaDisabledAt: null,
      });
      expect(result.status).toBe('not_required');
    });

    it('returns enrolled when SP Admin has MFA on', () => {
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: new Date('2026-01-01'),
        tenantCreatedAt: new Date('2026-01-01'),
        roleName: 'SP Admin',
        userMfaEnabled: true,
        userCreatedAt: new Date('2026-01-01'),
        userMfaDisabledAt: null,
      });
      expect(result.status).toBe('enrolled');
    });
  });

  describe('enterprise tier — all roles', () => {
    const roles = ['SP Admin', 'SP Operator', 'SP Analyst', 'SP Auditor', 'SP Collections'];
    it.each(roles)('requires MFA for %s', (role) => {
      const tierStart = new Date('2026-05-20T00:00:00Z');
      const now = new Date('2026-05-21T00:00:00Z'); // 1 day in
      const result = service.computeStatus({
        planTier: 'enterprise',
        tenantPlanTierChangedAt: tierStart,
        tenantCreatedAt: tierStart,
        roleName: role,
        userMfaEnabled: false,
        userCreatedAt: new Date('2026-01-01'),
        userMfaDisabledAt: null,
        now,
      });
      expect(result.status).toBe('pending');
      // tierStart May 20, now May 21 → graceEnd May 27.
      // msRemaining = 6 days exactly → floor = 6.
      expect(result.graceDaysRemaining).toBe(6);
    });
  });

  describe('grace start = max(tierStart, userCreated, mfaDisabledAt)', () => {
    it('uses userCreatedAt when later than tierStart', () => {
      const tierStart = new Date('2026-01-01T00:00:00Z');
      const userCreated = new Date('2026-05-20T00:00:00Z');
      const now = new Date('2026-05-22T00:00:00Z'); // 2 days after user created
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: tierStart,
        tenantCreatedAt: tierStart,
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: userCreated,
        userMfaDisabledAt: null,
        now,
      });
      // Grace ends at userCreated + 7 = 2026-05-27.
      // Remaining = 5 days.
      expect(result.status).toBe('pending');
      expect(result.graceDaysRemaining).toBe(5);
    });

    it('uses mfaDisabledAt when later than userCreated + tierStart', () => {
      const tierStart = new Date('2026-01-01T00:00:00Z');
      const userCreated = new Date('2026-02-01T00:00:00Z');
      const disabledAt = new Date('2026-05-20T00:00:00Z');
      const now = new Date('2026-05-24T00:00:00Z'); // 4 days after disable
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: tierStart,
        tenantCreatedAt: tierStart,
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: userCreated,
        userMfaDisabledAt: disabledAt,
        now,
      });
      // Grace ends at disabledAt + 7 = 2026-05-27.
      // Remaining = 3 days.
      expect(result.status).toBe('pending');
      expect(result.graceDaysRemaining).toBe(3);
    });

    it('falls back to tenantCreatedAt when planTierChangedAt is null', () => {
      const tenantCreated = new Date('2026-05-20T00:00:00Z');
      const now = new Date('2026-05-25T00:00:00Z'); // 5 days in
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: null,
        tenantCreatedAt: tenantCreated,
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: new Date('2026-01-01'),
        userMfaDisabledAt: null,
        now,
      });
      expect(result.status).toBe('pending');
      // 7 - 5 = 2 days remaining.
      expect(result.graceDaysRemaining).toBe(2);
    });
  });

  describe('grace expiry', () => {
    it('flips to overdue exactly at the 7-day boundary', () => {
      const tierStart = new Date('2026-05-20T00:00:00Z');
      const exactly7Days = new Date(tierStart.getTime() + 7 * ONE_DAY_MS);
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: tierStart,
        tenantCreatedAt: tierStart,
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: tierStart,
        userMfaDisabledAt: null,
        now: exactly7Days,
      });
      expect(result.status).toBe('overdue');
      // 0 ms remaining → daysRemaining = 0. Past the boundary by an
      // infinitesimal amount technically. The contract states "<=0 →
      // overdue".
      expect(result.graceDaysRemaining).toBe(0);
    });

    it('reports negative days when significantly past expiry', () => {
      const tierStart = new Date('2026-05-01T00:00:00Z');
      const now = new Date('2026-05-15T00:00:00Z'); // 14 days in
      const result = service.computeStatus({
        planTier: 'enterprise',
        tenantPlanTierChangedAt: tierStart,
        tenantCreatedAt: tierStart,
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: tierStart,
        userMfaDisabledAt: null,
        now,
      });
      expect(result.status).toBe('overdue');
      // 14 - 7 = 7 days past expiry → -7.
      expect(result.graceDaysRemaining).toBe(-7);
    });

    it('still pending on the last day (0 days remaining)', () => {
      const tierStart = new Date('2026-05-20T00:00:00Z');
      // 6 days and 23 hours in — under the boundary.
      const now = new Date(tierStart.getTime() + 7 * ONE_DAY_MS - 60_000);
      const result = service.computeStatus({
        planTier: 'growth',
        tenantPlanTierChangedAt: tierStart,
        tenantCreatedAt: tierStart,
        roleName: 'SP Admin',
        userMfaEnabled: false,
        userCreatedAt: tierStart,
        userMfaDisabledAt: null,
        now,
      });
      expect(result.status).toBe('pending');
      expect(result.graceDaysRemaining).toBe(0);
      expect(result.graceEndsAt).toBe(new Date(tierStart.getTime() + 7 * ONE_DAY_MS).toISOString());
    });
  });
});
