import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import type { Request } from 'express';

import { Public } from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import { AuditAction, EventBusService } from '@lons/common';
import { EventType, IWalletBalanceInsufficientEvent } from '@lons/event-contracts';

/**
 * Inbound wallet provider webhooks (P1-013 + Sprint 10B Task 8).
 *
 * Two endpoints:
 *   - `POST /webhooks/{provider}/insufficient-balance` — wallet provider tells
 *     us a transaction would overdraw the customer's wallet. Drives the
 *     overdraft drawdown flow.
 *   - `POST /webhooks/{provider}/transaction-notification` — wallet provider
 *     tells us a credit landed on the wallet. Drives auto-repayment.
 *
 * Both endpoints:
 *   - Are `@Public()` so they bypass JWT-based AuthGuard (they auth via HMAC).
 *   - Validate the HMAC signature in `x-signature` against per-provider
 *     shared secret in `WEBHOOK_SECRET_{PROVIDER}` env var.
 *   - Resolve `walletId` to `(tenantId, customerId)` via the customer's
 *     `metadata.walletId` field. If the lookup misses, return 404 — the
 *     wallet provider should retry with backoff.
 *   - Emit an internal event the overdraft-service consumes asynchronously.
 *     The HTTP response is 202 Accepted; the actual drawdown / repayment
 *     happens out-of-band so we don't block the wallet provider's webhook.
 */
@ApiTags('Wallet Webhooks')
@Public()
@Controller('webhooks')
export class WalletWebhookController {
  private readonly logger = new Logger('WalletWebhookController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  @Post(':provider/insufficient-balance')
  @HttpCode(HttpStatus.ACCEPTED)
  @AuditAction('wallet_webhook.insufficient_balance', 'wallet_webhook')
  @ApiOperation({
    summary: 'Wallet provider reports an insufficient-balance event',
    description:
      'Inbound webhook from the wallet provider. Authenticated via HMAC SHA-256 in the X-Signature header (provider-specific shared secret). ' +
      'Returns 202 immediately; the drawdown is processed asynchronously.',
  })
  @ApiParam({ name: 'provider', type: String, description: 'Wallet provider identifier (e.g. "mtn-momo", "m-pesa").' })
  @ApiResponse({ status: 202, description: 'Event accepted; drawdown processing happens asynchronously' })
  @ApiResponse({ status: 400, description: 'Provider is not configured (missing WEBHOOK_SECRET_{PROVIDER}).' })
  @ApiResponse({ status: 401, description: 'HMAC signature invalid' })
  @ApiResponse({ status: 404, description: 'Wallet ID not mapped to a customer' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Signature', required: true, description: 'HMAC SHA-256 of the request body, hex-encoded' })
  async insufficientBalance(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: InsufficientBalancePayload,
  ): Promise<{ accepted: true }> {
    this.verifySignature(provider, req, signature);

    const lookup = await this.resolveWallet(body.walletId, provider);
    if (!lookup) {
      throw new NotFoundException(`Wallet ${body.walletId.slice(0, 6)}… not mapped to any customer`);
    }
    const event: IWalletBalanceInsufficientEvent = {
      customerId: lookup.customerId,
      walletId: body.walletId,
      transactionAmount: body.transactionAmount,
      availableBalance: body.availableBalance,
      shortfall: body.shortfall,
      transactionRef: body.transactionRef,
      walletProvider: provider,
    };
    // Platform-admin tenant context: the wallet webhook arrives without a
    // JWT, so the global RLS interceptor doesn't enter a tenant. We enter
    // the resolved tenant explicitly so the event-bus + any downstream
    // Prisma writes pass RLS.
    await this.prisma.enterTenantContext({ tenantId: lookup.tenantId }, async () => {
      this.eventBus.emitAndBuild(EventType.WALLET_BALANCE_INSUFFICIENT, lookup.tenantId, event);
    });

    this.logger.log(
      `Insufficient-balance event accepted: provider=${provider} walletId=${body.walletId.slice(0, 6)}… shortfall=${body.shortfall}`,
    );
    return { accepted: true };
  }

  @Post(':provider/transaction-notification')
  @HttpCode(HttpStatus.ACCEPTED)
  @AuditAction('wallet_webhook.transaction_notification', 'wallet_webhook')
  @ApiOperation({
    summary: 'Wallet provider reports a credit/debit on the wallet',
    description:
      'Inbound webhook from the wallet provider. Authenticated via HMAC SHA-256 in X-Signature. ' +
      'Only credit events drive auto-repayment; debit notifications are accepted but ignored.',
  })
  @ApiParam({ name: 'provider', type: String, description: 'Wallet provider identifier.' })
  @ApiResponse({ status: 202, description: 'Event accepted' })
  @ApiResponse({ status: 400, description: 'Provider is not configured.' })
  @ApiResponse({ status: 401, description: 'HMAC signature invalid' })
  @ApiResponse({ status: 404, description: 'Wallet ID not mapped' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Signature', required: true, description: 'HMAC SHA-256 of the request body, hex-encoded' })
  async transactionNotification(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: TransactionNotificationPayload,
  ): Promise<{ accepted: true; ignored?: boolean }> {
    this.verifySignature(provider, req, signature);

    if (body.type !== 'credit') {
      // Per SPEC §7.1 step 1: only credit events drive auto-repayment.
      // Debit notifications are no-ops.
      return { accepted: true, ignored: true };
    }

    const lookup = await this.resolveWallet(body.walletId, provider);
    if (!lookup) {
      throw new NotFoundException(`Wallet ${body.walletId.slice(0, 6)}… not mapped to any customer`);
    }

    await this.prisma.enterTenantContext({ tenantId: lookup.tenantId }, async () => {
      this.eventBus.emitAndBuild(EventType.WALLET_BALANCE_CREDITED, lookup.tenantId, {
        customerId: lookup.customerId,
        walletId: body.walletId,
        creditAmount: body.amount,
        newBalance: body.newBalance,
        transactionRef: body.transactionRef,
        walletProvider: provider,
      });
    });

    this.logger.log(
      `Wallet credit accepted: provider=${provider} walletId=${body.walletId.slice(0, 6)}… amount=${body.amount}`,
    );
    return { accepted: true };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Validates the HMAC SHA-256 signature in `x-signature` against the body
   * and the provider-specific shared secret. Throws ForbiddenException on
   * mismatch — never returns a boolean (we don't want callers to forget to
   * check).
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
      throw new BadRequestException(`Provider ${provider} is not configured (missing ${secretEnv})`);
    }
    const raw = req.rawBody;
    if (!raw) {
      // rawBody is populated by NestFactory when `rawBody: true` is set on
      // the Nest app. If it's missing, fall back to JSON-stringifying the
      // parsed body — less precise but still produces a deterministic hash.
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
   * Map (provider, walletId) → (tenantId, customerId). Sprint 11 A10:
   * uses the dedicated `wallet_account_mappings` table (unique on
   * `(provider, wallet_id)`) instead of the previous O(n) scan over
   * every customer's `metadata.walletId`.
   *
   * Falls back to the legacy `customer.metadata.walletId` scan if no row
   * is found in the mapping table — this lets the migration be deployed
   * before the data backfill (`scripts/backfill-wallet-account-mappings.ts`)
   * runs without breaking inbound webhooks. Once the backfill has
   * completed in every environment, the fallback can be removed.
   */
  private async resolveWallet(
    walletId: string,
    provider: string,
  ): Promise<{ tenantId: string; customerId: string } | null> {
    return this.prisma.enterTenantContext({ isPlatformAdmin: true }, async () => {
      // Fast path: dedicated mapping table.
      const mapping = await this.prisma.walletAccountMapping.findUnique({
        where: { provider_walletId: { provider, walletId } },
        select: { tenantId: true, customerId: true },
      });
      if (mapping) return mapping;

      // Legacy fallback for unbackfilled environments. Logged so we can
      // monitor when backfill completion lets us remove this branch.
      const matches = await this.prisma.customer.findMany({
        where: {
          metadata: { path: ['walletId'], equals: walletId },
          deletedAt: null,
        },
        select: { id: true, tenantId: true },
        take: 2,
      });
      if (matches.length === 0) return null;
      if (matches.length > 1) {
        this.logger.error(
          `Wallet ID ${walletId.slice(0, 6)}… maps to multiple customers — refusing to route`,
        );
        return null;
      }
      this.logger.warn(
        `Wallet ${walletId.slice(0, 6)}… resolved via legacy customer.metadata fallback — backfill needed`,
      );
      return { tenantId: matches[0].tenantId, customerId: matches[0].id };
    });
  }
}

function safeCompare(secret: string, payload: Buffer, providedSignature: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // crypto.timingSafeEqual requires equal-length inputs.
  if (providedSignature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(providedSignature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

interface InsufficientBalancePayload {
  walletId: string;
  transactionAmount: string;
  availableBalance: string;
  shortfall: string;
  transactionRef: string;
}

interface TransactionNotificationPayload {
  walletId: string;
  type: 'credit' | 'debit';
  amount: string;
  newBalance: string;
  transactionRef: string;
}
