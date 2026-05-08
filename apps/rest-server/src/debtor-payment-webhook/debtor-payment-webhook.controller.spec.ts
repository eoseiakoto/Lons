/**
 * Sprint 13 S13-1 — Inbound debtor-payment webhook controller tests.
 *
 * Coverage:
 *   - HMAC signature validation (valid → 202, invalid → ForbiddenException,
 *     missing → ForbiddenException).
 *   - DTO validation: malformed amount and missing matchers
 *     (controller-level fallback check).
 *   - Tenant resolution via WEBHOOK_TENANT_{PROVIDER} env var.
 *   - Happy path: returns 202 + { status: 'accepted', transactionRef }
 *     and forwards the call to matchingService asynchronously.
 */

import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { DebtorPaymentWebhookController } from './debtor-payment-webhook.controller';
import { DebtorPaymentWebhookDto } from './debtor-payment-webhook.dto';

// Helper to drain `setImmediate` callbacks queued by the controller.
function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const PROVIDER = 'mtn-momo';
const SECRET_ENV_KEY = 'WEBHOOK_SECRET_MTN_MOMO';
const TENANT_ENV_KEY = 'WEBHOOK_TENANT_MTN_MOMO';
const SECRET = 'shared-secret-1';
const TENANT = '11111111-1111-1111-1111-111111111111';

function makeController(opts: { matchAndApply?: jest.Mock } = {}) {
  const matchingService = {
    matchAndApply: opts.matchAndApply ?? jest.fn(async () => ({ matched: true })),
  } as any;
  const prisma = {
    enterTenantContext: jest.fn(async (_ctx: any, fn: any) => fn()),
  } as any;
  return {
    controller: new DebtorPaymentWebhookController(prisma, matchingService),
    matchingService,
    prisma,
  };
}

function signBody(body: unknown, secret = SECRET): { raw: Buffer; signature: string } {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(raw)
    .digest('hex');
  return { raw, signature };
}

describe('DebtorPaymentWebhookController', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env[SECRET_ENV_KEY] = SECRET;
    process.env[TENANT_ENV_KEY] = TENANT;
  });

  afterEach(() => {
    delete process.env[SECRET_ENV_KEY];
    delete process.env[TENANT_ENV_KEY];
    Object.assign(process.env, originalEnv);
    jest.clearAllMocks();
  });

  // ── HMAC validation ────────────────────────────────────────────────────

  it('rejects requests with a bad signature', async () => {
    const { controller } = makeController();
    const body: any = {
      transactionRef: 'TX-1',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-1',
    };
    const { raw } = signBody(body);
    const req: any = { rawBody: raw, body };

    await expect(
      controller.debtorPayment(PROVIDER, req, 'deadbeef'.repeat(8), body),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects requests with no signature header', async () => {
    const { controller } = makeController();
    const body: any = {
      transactionRef: 'TX-1',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-1',
    };
    const { raw } = signBody(body);
    const req: any = { rawBody: raw, body };

    await expect(
      controller.debtorPayment(PROVIDER, req, undefined, body),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects requests for an unconfigured provider (no secret env)', async () => {
    delete process.env[SECRET_ENV_KEY];
    const { controller } = makeController();
    const body: any = {
      transactionRef: 'TX-1',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-1',
    };
    const { raw, signature } = signBody(body);
    const req: any = { rawBody: raw, body };

    await expect(
      controller.debtorPayment(PROVIDER, req, signature, body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── DTO validation ─────────────────────────────────────────────────────

  it('DTO rejects malformed amount (letters)', async () => {
    const dto = plainToInstance(DebtorPaymentWebhookDto, {
      transactionRef: 'TX-1',
      amount: 'abc',
      currency: 'GHS',
      invoiceNumber: 'INV-1',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('DTO rejects payload missing all of invoiceNumber, debtorRef, paymentRef', async () => {
    const dto = plainToInstance(DebtorPaymentWebhookDto, {
      transactionRef: 'TX-1',
      amount: '10000.00',
      currency: 'GHS',
    });
    const errors = await validate(dto);
    // The class-level constraint surfaces as the synthetic _atLeastOneMatcher
    // property error.
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some((e) =>
        Object.values(e.constraints ?? {}).some((m) =>
          /at least one/.test(m),
        ),
      ),
    ).toBe(true);
  });

  it('controller-level fallback: rejects payload missing all matchers with BadRequestException', async () => {
    const { controller } = makeController();
    const body: any = {
      transactionRef: 'TX-1',
      amount: '10000.00',
      currency: 'GHS',
    };
    const { raw, signature } = signBody(body);
    const req: any = { rawBody: raw, body };

    await expect(
      controller.debtorPayment(PROVIDER, req, signature, body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when provider tenant is unconfigured', async () => {
    delete process.env[TENANT_ENV_KEY];
    const { controller } = makeController();
    const body: any = {
      transactionRef: 'TX-1',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-1',
    };
    const { raw, signature } = signBody(body);
    const req: any = { rawBody: raw, body };

    await expect(
      controller.debtorPayment(PROVIDER, req, signature, body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it('happy path: returns 202 with { status: "accepted", transactionRef }', async () => {
    const matchAndApply = jest.fn(async () => ({
      matched: true,
      invoiceId: 'inv-1',
      matchStrategy: 'invoice_number',
    }));
    const { controller, matchingService, prisma } = makeController({
      matchAndApply,
    });
    const body: any = {
      transactionRef: 'TX-HAPPY',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-1',
    };
    const { raw, signature } = signBody(body);
    const req: any = { rawBody: raw, body };

    const result = await controller.debtorPayment(
      PROVIDER,
      req,
      signature,
      body,
    );

    expect(result).toEqual({ status: 'accepted', transactionRef: 'TX-HAPPY' });

    // Async dispatch happens via setImmediate — drain it then assert.
    await flushSetImmediate();
    // Tenant entered with the resolved tenantId from the env var.
    expect(prisma.enterTenantContext).toHaveBeenCalledWith(
      { tenantId: TENANT },
      expect.any(Function),
    );
    expect(matchingService.matchAndApply).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        transactionRef: 'TX-HAPPY',
        amount: '10000.00',
        currency: 'GHS',
        invoiceNumber: 'INV-1',
      }),
    );
  });

  it('forwards the correct tenantId to matchingService (tenant resolution)', async () => {
    const altTenant = '99999999-9999-9999-9999-999999999999';
    process.env[TENANT_ENV_KEY] = altTenant;
    const { controller, matchingService } = makeController();
    const body: any = {
      transactionRef: 'TX-TENANT',
      amount: '500.00',
      currency: 'GHS',
      debtorRef: 'REG-1',
    };
    const { raw, signature } = signBody(body);
    const req: any = { rawBody: raw, body };

    await controller.debtorPayment(PROVIDER, req, signature, body);
    await flushSetImmediate();

    expect(matchingService.matchAndApply).toHaveBeenCalledWith(
      altTenant,
      expect.any(Object),
    );
  });

  it('async dispatch errors are caught and logged (response still 202)', async () => {
    const matchAndApply = jest.fn(async () => {
      throw new Error('boom');
    });
    const { controller } = makeController({ matchAndApply });
    const body: any = {
      transactionRef: 'TX-ERR',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-1',
    };
    const { raw, signature } = signBody(body);
    const req: any = { rawBody: raw, body };

    const result = await controller.debtorPayment(
      PROVIDER,
      req,
      signature,
      body,
    );
    expect(result).toEqual({ status: 'accepted', transactionRef: 'TX-ERR' });
    // Drain — the catch must not throw out of setImmediate.
    await flushSetImmediate();
    // No assertion on the logger directly; the test passes if the
    // background promise's rejection is swallowed by `.catch()`.
  });
});
