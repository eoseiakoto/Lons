import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import type { Request } from 'express';

import { Public } from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import { AuditAction } from '@lons/common';
import { DebtorPaymentMatchingService } from '@lons/process-engine';

import { DebtorPaymentWebhookDto } from './debtor-payment-webhook.dto';

/**
 * Sprint 13 S13-1 — Inbound debtor-payment webhook (F-IF-2).
 *
 * Payment providers (banks, mobile money operators) call this endpoint
 * when a debtor pays a factored invoice. The platform then auto-matches
 * the payment to the correct invoice and applies it via
 * `ReserveService.recordDebtorPayment` (delegated through the matching
 * service).
 *
 * Endpoint: `POST /webhooks/{provider}/debtor-payment`
 *
 * Mirrors the wallet-webhook pattern:
 *   - `@Public()` — bypasses JWT AuthGuard (auth is via HMAC).
 *   - HMAC SHA-256 signature in `x-signature` validated against
 *     `WEBHOOK_SECRET_{PROVIDER}` env var.
 *   - Returns 202 Accepted immediately; matching/application happen async.
 *
 * Tenant resolution: payment providers don't carry tenant context in
 * their payloads. We map `provider → tenantId` via `WEBHOOK_TENANT_{PROVIDER}`
 * env var. This keeps the deployment story simple: add a provider, add its
 * secret + tenant id. Multi-tenant providers (one provider serving multiple
 * SPs) would need a richer mapping table — out of scope for S13.
 */
@ApiTags('Debtor Payment Webhooks')
@Public()
@Controller('webhooks')
export class DebtorPaymentWebhookController {
  private readonly logger = new Logger('DebtorPaymentWebhookController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: DebtorPaymentMatchingService,
  ) {}

  @Post(':provider/debtor-payment')
  @HttpCode(HttpStatus.ACCEPTED)
  @AuditAction('debtor_payment_webhook.received', 'invoice')
  @ApiOperation({
    summary: 'Payment provider reports a debtor invoice payment',
  })
  @ApiResponse({
    status: 202,
    description:
      'Payment accepted; matching and application happen asynchronously',
  })
  @ApiResponse({ status: 400, description: 'Payload missing all matchers' })
  @ApiResponse({ status: 401, description: 'HMAC signature invalid' })
  @ApiHeader({
    name: 'X-Signature',
    required: true,
    description: 'HMAC SHA-256 of the request body, hex-encoded',
  })
  async debtorPayment(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: DebtorPaymentWebhookDto,
  ): Promise<{ status: 'accepted'; transactionRef: string }> {
    this.verifySignature(provider, req, signature);

    // Belt-and-braces: even with the class-validator constraint on the DTO,
    // make the contract obvious at the controller boundary so a future
    // refactor of the validator can't accidentally let a no-matcher payload
    // through to the matching service. paymentRef is supplementary metadata
    // and does NOT count as a matcher (S13B-4 fix: F-S13-1).
    if (!body.invoiceNumber && !body.debtorRef) {
      throw new BadRequestException(
        'At least one of invoiceNumber or debtorRef is required',
      );
    }

    const tenantId = this.resolveTenant(provider);

    // Kick off matching async — never await in the response path so we
    // return 202 quickly. Errors are logged; the provider will retry on
    // failure (or our DEBTOR_PAYMENT_UNMATCHED event surfaces it).
    setImmediate(() => {
      this.prisma
        .enterTenantContext({ tenantId }, async () => {
          await this.matchingService.matchAndApply(tenantId, {
            transactionRef: body.transactionRef,
            amount: body.amount,
            currency: body.currency,
            invoiceNumber: body.invoiceNumber,
            debtorRef: body.debtorRef,
            paymentRef: body.paymentRef,
            // S13B-1 / S13B-6: forward the provider so the matching service
            // can include it in webhook-activity audit-log metadata.
            provider,
            metadata: body.metadata,
          });
        })
        .catch((err) => {
          this.logger.error(
            `Async debtor-payment processing failed for ${body.transactionRef} (provider=${provider}): ${
              (err as Error).message
            }`,
            (err as Error).stack,
          );
        });
    });

    this.logger.log(
      `Debtor-payment webhook accepted: provider=${provider} transactionRef=${body.transactionRef} amount=${body.amount} ${body.currency}`,
    );
    return { status: 'accepted', transactionRef: body.transactionRef };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Validates the HMAC SHA-256 signature in `x-signature` against the body
   * and the provider-specific shared secret. Throws on mismatch.
   */
  private verifySignature(
    provider: string,
    req: RawBodyRequest<Request>,
    signature: string | undefined,
  ): void {
    if (!signature) {
      throw new ForbiddenException('Missing x-signature header');
    }
    const secretEnv = `WEBHOOK_SECRET_${provider.toUpperCase().replace(/-/g, '_')}`;
    const secret = process.env[secretEnv];
    if (!secret) {
      throw new BadRequestException(
        `Provider ${provider} is not configured (missing ${secretEnv})`,
      );
    }
    const raw = req.rawBody;
    if (!raw) {
      const fallback = Buffer.from(JSON.stringify(req.body));
      if (!safeCompare(secret, fallback, signature)) {
        throw new ForbiddenException('Invalid signature');
      }
      return;
    }
    if (!safeCompare(secret, raw, signature)) {
      throw new ForbiddenException('Invalid signature');
    }
  }

  /**
   * Resolve `provider → tenantId` via `WEBHOOK_TENANT_{PROVIDER}` env var.
   * Throws if unconfigured — better to fail loudly than silently route
   * payments to a wrong tenant.
   */
  private resolveTenant(provider: string): string {
    const envKey = `WEBHOOK_TENANT_${provider.toUpperCase().replace(/-/g, '_')}`;
    const tenantId = process.env[envKey];
    if (!tenantId) {
      throw new BadRequestException(
        `Provider ${provider} is not mapped to a tenant (missing ${envKey})`,
      );
    }
    return tenantId;
  }
}

function safeCompare(
  secret: string,
  payload: Buffer,
  providedSignature: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  if (providedSignature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
