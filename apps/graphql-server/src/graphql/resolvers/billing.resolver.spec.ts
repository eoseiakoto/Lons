import 'reflect-metadata';

import { REQUIRED_PLAN_KEY } from '@lons/common';

import { BillingResolver } from './billing.resolver';

/**
 * FIX-BA-2 — read queries are open to every tier. The `markInvoicePaid`
 * mutation retains its `growth`-tier gate.
 *
 * We verify by reading the `@RequiresPlan` metadata directly off the
 * resolver prototype. Tying the test to the metadata key (rather than
 * standing up the full DI + guard + tenant-tier database) keeps it
 * cheap and stable — if the gate is reintroduced for a read query the
 * test fails immediately.
 */
describe('BillingResolver — plan-tier gate (FIX-BA-2)', () => {
  // NestJS's SetMetadata stores method-level metadata on the method
  // function itself (descriptor.value), not on the prototype object
  // keyed by method name. So we look up `prototype[method]` and read
  // the metadata off the function reference.
  const planTier = (method: string): string | undefined => {
    const fn = (BillingResolver.prototype as unknown as Record<string, unknown>)[
      method
    ];
    return Reflect.getMetadata(REQUIRED_PLAN_KEY, fn as object);
  };

  it('billingInvoices is accessible to Starter-tier tenants (no @RequiresPlan)', () => {
    expect(planTier('billingInvoices')).toBeUndefined();
  });

  it('billingInvoice is accessible to Starter-tier tenants (no @RequiresPlan)', () => {
    expect(planTier('billingInvoice')).toBeUndefined();
  });

  it('usageHistory is accessible to Starter-tier tenants (carried over from FIX-4)', () => {
    expect(planTier('usageHistory')).toBeUndefined();
  });

  it('markInvoicePaid retains its growth-tier gate (mutations stay restricted)', () => {
    expect(planTier('markInvoicePaid')).toBe('growth');
  });
});
