# Sprint 7 — BA Review Fix Prompt (Deployment Engineer)

> **Context:** The Business Analyst reviewed the DE's Sprint 7 staging deployment and flagged 1 Critical issue in the Helm staging values. This is a quick fix — 2 missing environment variables.

---

## Fix 1 (Critical): DE-02 — Add Missing Environment Variables to `values-staging.yaml`

**Problem:** Two environment variables are missing from `infrastructure/helm/lons/values-staging.yaml`, causing:
1. The debug panel to return 404 in staging (invisible to SP prospects)
2. New SP onboarding to break when no tenant-specific WalletProviderConfig exists yet

**File to modify:** `infrastructure/helm/lons/values-staging.yaml`

### Change 1: Add `NEXT_PUBLIC_STAGING_DEBUG_MODE` to admin-portal

The admin-portal debug page (`apps/admin-portal/src/app/(portal)/debug/page.tsx`) checks `process.env.NEXT_PUBLIC_STAGING_DEBUG_MODE === 'true'` at module level. Without this env var, the debug panel is completely hidden.

Add to the admin-portal ConfigMap/env section:
```yaml
NEXT_PUBLIC_STAGING_DEBUG_MODE: "true"
```

This should be in the admin-portal's environment variables block, alongside the existing admin-portal config (look for the `adminPortal` section or the admin-portal container env block).

### Change 2: Add `DEFAULT_WALLET_PROVIDER` to integration-service

The WalletAdapterResolver falls back to this env var when a tenant doesn't have a WalletProviderConfig record yet (e.g., a newly onboarded SP in staging). Without it, wallet operations for new SPs throw an error.

Add to the integration-service env section:
```yaml
DEFAULT_WALLET_PROVIDER: "MOCK"
```

This should be in the integration-service environment variables block, near the existing `allowMockAdapters: "true"` config.

---

## Verification Checklist

- [ ] `NEXT_PUBLIC_STAGING_DEBUG_MODE: "true"` appears in admin-portal env config
- [ ] `DEFAULT_WALLET_PROVIDER: "MOCK"` appears in integration-service env config
- [ ] `helm template` still renders cleanly with no YAML errors
- [ ] No other values files (values.yaml, values-prod.yaml if it exists) are modified — these are staging-only settings
