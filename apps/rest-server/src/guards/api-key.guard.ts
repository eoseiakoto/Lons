import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiKeyService } from '@lons/entity-service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = this.getRequest(context);

    // Check for Bearer token — JWT auth handled elsewhere, pass through
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return true;
    }

    // Security Hardening (SEC-3): two-factor extraction. Both X-API-Key
    // and X-API-Secret are required; previously the secret was extracted
    // and asserted-present but never validated, which made the contract a
    // single-factor system. The validation now happens inside
    // ApiKeyService.validateApiKey() with timing-safe comparison.
    const apiKey = request.headers['x-api-key'];
    const apiSecret = request.headers['x-api-secret'];

    if (!apiKey || !apiSecret) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'API key and secret required. Provide X-API-Key and X-API-Secret headers.',
      });
    }

    if (typeof apiKey !== 'string' || typeof apiSecret !== 'string') {
      // Header arrays (multiple values) are a misconfigured client; reject.
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'API key and secret must be single string values.',
      });
    }

    try {
      // SEC-3: pass BOTH credentials. The service does timing-safe
      // comparison of the secret hash and returns an opaque tenant id +
      // rate limit on success.
      const result = await this.apiKeyService.validateApiKey(apiKey, apiSecret);

      // Attach tenant context and API key metadata to the request. We use
      // the *opaque* `apiKeyId` from the service result (UUID) — never
      // store the plaintext key on the request, which could otherwise
      // leak through logs or downstream serializers.
      request['tenantId'] = result.tenantId;
      request['apiKeyId'] = result.apiKeyId;
      request['rateLimitPerMin'] = result.rateLimitPerMin;

      return true;
    } catch (error: any) {
      // Log the failure but never echo back which factor failed — the
      // service already returns a generic "Invalid API credentials"
      // message. We keep the error.message in the log for ops triage.
      this.logger.warn(`API key validation failed: ${error.message}`);
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: error.message || 'Invalid API credentials',
      });
    }
  }

  /**
   * Extract the request object from either HTTP or GraphQL execution contexts.
   *
   * We avoid importing @nestjs/graphql (not a dependency of this package) and
   * instead manually extract `req` from the GraphQL context argument, which is
   * the third element in the resolver args array: [root, args, context, info].
   */
  private getRequest(context: ExecutionContext): any {
    const contextType = context.getType<string>();
    if (contextType === 'graphql') {
      const gqlArgs = context.getArgs();
      const ctx = gqlArgs[2]; // [root, args, context, info]
      return ctx?.req ?? {};
    }
    return context.switchToHttp().getRequest();
  }
}
