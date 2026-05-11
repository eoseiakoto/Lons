/**
 * Security Hardening (SEC-8) — GraphqlExceptionFilter P2002 sanitization.
 *
 * Verifies the duplicate-record error response never echoes back internal
 * column names (especially the `*Hash` columns added in SEC-1 / S13B-2)
 * which would leak the schema's encrypted-PII layout.
 */
import { GraphQLError } from 'graphql';

import { GraphqlExceptionFilter } from './graphql-exception.filter';

class FakeArgumentsHost {}

function p2002(target: unknown): { code: string; meta: { target: unknown } } {
  return { code: 'P2002', meta: { target } };
}

describe('GraphqlExceptionFilter — P2002 sanitization (SEC-8)', () => {
  const filter = new GraphqlExceptionFilter();

  function catchAs<T extends GraphQLError = GraphQLError>(
    exception: unknown,
  ): T {
    const result = filter.catch(exception, new FakeArgumentsHost() as never);
    expect(result).toBeInstanceOf(GraphQLError);
    return result as T;
  }

  it('preserves the product code special case (non-PII, safe to echo)', () => {
    const err = catchAs(p2002(['code']));
    expect(err.message).toMatch(/product with this code/i);
    expect(err.extensions?.code).toBe('DUPLICATE_CODE');
    expect(err.extensions?.field).toBe('code');
  });

  it('renames emailHash → "email" in the error message', () => {
    const err = catchAs(p2002(['emailHash']));
    expect(err.message).toMatch(/this email already exists/i);
    expect(err.message).not.toContain('Hash');
    expect(err.message).not.toContain('hash');
  });

  it('renames registrationNumberHash → "registration number"', () => {
    const err = catchAs(p2002(['tenantId', 'companyName', 'registrationNumberHash']));
    expect(err.message).toMatch(/registration number/);
    expect(err.message).toMatch(/company name/);
    // tenantId is collapsed away — never echo it.
    expect(err.message).not.toMatch(/tenantId/);
    expect(err.message).not.toMatch(/tenant_id/);
  });

  it('handles snake_case column names from raw Postgres errors', () => {
    const err = catchAs(p2002(['email_hash']));
    expect(err.message).toMatch(/this email already exists/i);
  });

  it('collapses unknown column names to a generic placeholder (no schema leak)', () => {
    const err = catchAs(p2002(['some_internal_secret_column']));
    expect(err.message).toMatch(/this value already exists/i);
    // The unknown column name MUST NOT appear in the response.
    expect(err.message).not.toMatch(/some_internal_secret_column/);
  });

  it('NEVER echoes the raw target array in extensions', () => {
    const err = catchAs(p2002(['emailHash']));
    // Pre-SEC-8 the filter set extensions.fields = target. The new shape
    // omits it entirely.
    expect(err.extensions).not.toHaveProperty('fields');
  });

  it('handles a non-array string target safely', () => {
    const err = catchAs(p2002('emailHash'));
    expect(err.message).toMatch(/this email already exists/i);
  });

  it('handles a missing target meta safely', () => {
    const err = catchAs({ code: 'P2002', meta: {} });
    expect(err.message).toMatch(/this value already exists/i);
  });

  it('still emits the DUPLICATE_ENTRY code for non-product violations', () => {
    const err = catchAs(p2002(['emailHash']));
    expect(err.extensions?.code).toBe('DUPLICATE_ENTRY');
  });
});
