-- S19-STAB-5: MFA tier enforcement support columns
--
-- Per SPEC-plan-tiers.md §2.5:
--   Growth tier      → MFA required for admin roles (SP Admin)
--   Enterprise tier  → MFA required for all roles
--
-- The compliance check needs to know two things that the schema
-- doesn't currently track:
--
--   1. WHEN a tenant's plan tier changed (for the grace-period
--      countdown that starts on upgrade).
--   2. WHEN a user last disabled their MFA (for the edge case where
--      an operator was already enrolled and then disables — PM
--      directive: they get a fresh 7-day grace window from the
--      moment of disablement).
--
-- Both columns are nullable. Null on `plan_tier_changed_at` means
-- "we don't know" — the compliance service falls back to
-- `tenant.createdAt` so existing tenants don't suddenly enter grace
-- with no historical reference point. Null on `mfa_disabled_at`
-- means "never disabled" — the compliance check ignores it.
--
-- Application code:
--   - Tenant tier-change mutation sets plan_tier_changed_at = now().
--   - `auth.resolver.ts:disableMfa` sets user.mfa_disabled_at = now().
--   - `auth.service.ts:loginTenantUser` reads both fields when
--     computing MFA compliance.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_tier_changed_at TIMESTAMPTZ(6);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_disabled_at TIMESTAMPTZ(6);

-- Backfill: for tenants that already exist, treat the row creation
-- time as the "tier set at" baseline. This avoids existing tenants
-- showing up as "in grace period" with no grace start reference
-- (which would otherwise read as `1970-01-01 + 7 days` already
-- expired, hard-blocking everyone on first login post-migration).
UPDATE tenants
SET plan_tier_changed_at = created_at
WHERE plan_tier_changed_at IS NULL;
