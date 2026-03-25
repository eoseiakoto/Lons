import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Check for Bearer token
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      // JWT auth handled elsewhere — pass through
      return true;
    }

    // Check for API key
    const apiKey = request.headers['x-api-key'];
    const apiSecret = request.headers['x-api-secret'];

    if (!apiKey || !apiSecret) {
      throw new UnauthorizedException(
        'API key and secret required. Provide X-API-Key and X-API-Secret headers.',
      );
    }

    // In production, validate against stored API keys
    // For now, accept any non-empty key/secret pair and extract tenant from key prefix
    // API key format: tenant-slug_key-id (e.g., quickcash-gh_abc123)
    request['tenantSlug'] = apiKey.split('_')[0];
    request['apiKeyId'] = apiKey.split('_')[1];

    return true;
  }
}
