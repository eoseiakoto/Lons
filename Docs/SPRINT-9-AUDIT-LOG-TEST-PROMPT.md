# Sprint 9 — Micro Fix: Audit Log Assertion for Rejected Inactive Tenant Access

**Priority: LOW — Final item before sprint close**
**Owner: Claude Code (DEV)**
**Date: 2026-04-14**

---

## Context

File: `apps/graphql-server/src/__tests__/x-tenant-context-inactive.integration.spec.ts`

Test cases 1 and 3 are complete. Test case 2 (audit log behavior after rejected inactive tenant access) exists but has **no assertions**. The architecture is correct — the auth guard rejects via `ForbiddenException` before the request reaches the audit interceptor (`packages/common/src/audit/audit-event.interceptor.ts`), so no audit entry is created. We just need a test that proves this.

## What to Do

In the existing test file, add assertions to the test case for audit log behavior. The test should verify that when the auth guard rejects an inactive tenant request, no audit log entry is created for that attempt.

```typescript
it('should NOT create an audit log entry for rejected inactive tenant access', async () => {
  // 1. Record the current audit log count (or the latest audit log ID)
  const auditCountBefore = await prisma.auditLog.count();

  // 2. Attempt the inactive tenant request (expect rejection)
  try {
    await guard.canActivate(inactiveTenantContext);
  } catch (e) {
    // Expected: ForbiddenException
  }

  // 3. Verify no new audit log entry was created
  const auditCountAfter = await prisma.auditLog.count();
  expect(auditCountAfter).toBe(auditCountBefore);
});
```

If the test uses mocked Prisma (not a real database), adapt accordingly:

```typescript
it('should NOT create an audit log entry for rejected inactive tenant access', async () => {
  // The guard throws ForbiddenException before the handler runs.
  // The audit interceptor (audit-event.interceptor.ts) only logs on
  // successful handler resolution (uses tap() after next.handle()).
  // Therefore, no audit entry should be created.

  await expect(guard.canActivate(inactiveTenantContext)).rejects.toThrow(ForbiddenException);

  // Verify the audit service was never called
  expect(mockAuditService.log).not.toHaveBeenCalled();
  // OR if using Prisma directly:
  expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
});
```

Pick whichever approach matches the existing test setup in the file.

## Definition of Done

- [ ] Test case 2 has meaningful assertions verifying no audit log entry is created on guard rejection
- [ ] All 3 test cases in the file pass
- [ ] All existing X-Tenant-Context tests still pass
