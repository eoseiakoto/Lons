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
    const request = context.switchToHttp().getRequest();

    // Check for Bearer token — JWT auth handled elsewhere, pass through
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return true;
    }

    // Check for API key
    const apiKey = request.headers['x-api-key'];
    const apiSecret = request.headers['x-api-secret'];

    if (!apiKey || !apiSecret) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'API key and secret required. Provide X-API-Key and X-API-Secret headers.',
      });
    }

    try {
      // Validate the API key against the database
      const result = await this.apiKeyService.validateApiKey(apiKey);

      // Attach tenant context and API key metadata to the request
      request['tenantId'] = result.tenantId;
      request['apiKeyId'] = apiKey;
      request['rateLimitPerMin'] = result.rateLimitPerMin;

      return true;
    } catch (error: any) {
      this.logger.warn(`API key validation failed: ${error.message}`);
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: error.message || 'Invalid API key or secret',
      });
    }
  }
}
