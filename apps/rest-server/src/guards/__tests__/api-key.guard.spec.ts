import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from '../api-key.guard';

// ---------------------------------------------------------------------------
// Mock ApiKeyService
// ---------------------------------------------------------------------------

function createMockApiKeyService(overrides: Partial<{ validateApiKey: jest.Mock }> = {}) {
  return {
    validateApiKey: overrides.validateApiKey ?? jest.fn().mockResolvedValue({
      tenantId: 'tenant-123',
      rateLimitPerMin: 100,
    }),
  };
}

// ---------------------------------------------------------------------------
// Helpers to build mock NestJS execution contexts
// ---------------------------------------------------------------------------

function makeHttpContext(headers: Record<string, string> = {}): {
  context: ExecutionContext;
  request: Record<string, any>;
} {
  const request: Record<string, any> = { headers };

  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

function makeGqlContext(headers: Record<string, string> = {}): {
  context: ExecutionContext;
  request: Record<string, any>;
} {
  const request: Record<string, any> = { headers };

  // GraphQL resolver args: [root, args, context, info]
  const gqlArgs = [{}, {}, { req: request }, {}];

  const context = {
    getType: () => 'graphql',
    getArgs: () => gqlArgs,
  } as unknown as ExecutionContext;

  return { context, request };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiKeyGuard', () => {
  // -------------------------------------------------------------------------
  // HTTP context tests
  // -------------------------------------------------------------------------

  describe('HTTP context', () => {
    it('passes through when a Bearer token is present', async () => {
      const service = createMockApiKeyService();
      const guard = new ApiKeyGuard(service as any);
      const { context } = makeHttpContext({ authorization: 'Bearer some-jwt' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(service.validateApiKey).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when no API key headers are present', async () => {
      const service = createMockApiKeyService();
      const guard = new ApiKeyGuard(service as any);
      const { context } = makeHttpContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('validates and attaches tenant context for a valid API key', async () => {
      const service = createMockApiKeyService();
      const guard = new ApiKeyGuard(service as any);
      const { context, request } = makeHttpContext({
        'x-api-key': 'key-abc',
        'x-api-secret': 'secret-xyz',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(service.validateApiKey).toHaveBeenCalledWith('key-abc');
      expect(request['tenantId']).toBe('tenant-123');
      expect(request['apiKeyId']).toBe('key-abc');
      expect(request['rateLimitPerMin']).toBe(100);
    });

    it('throws UnauthorizedException when API key validation fails', async () => {
      const service = createMockApiKeyService({
        validateApiKey: jest.fn().mockRejectedValue(new Error('Key revoked')),
      });
      const guard = new ApiKeyGuard(service as any);
      const { context } = makeHttpContext({
        'x-api-key': 'key-abc',
        'x-api-secret': 'secret-xyz',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  // -------------------------------------------------------------------------
  // GraphQL context tests
  // -------------------------------------------------------------------------

  describe('GraphQL context', () => {
    it('passes through when a Bearer token is present', async () => {
      const service = createMockApiKeyService();
      const guard = new ApiKeyGuard(service as any);
      const { context } = makeGqlContext({ authorization: 'Bearer some-jwt' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(service.validateApiKey).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when no API key headers are present', async () => {
      const service = createMockApiKeyService();
      const guard = new ApiKeyGuard(service as any);
      const { context } = makeGqlContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('validates and attaches tenant context for a valid API key', async () => {
      const service = createMockApiKeyService();
      const guard = new ApiKeyGuard(service as any);
      const { context, request } = makeGqlContext({
        'x-api-key': 'key-abc',
        'x-api-secret': 'secret-xyz',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(service.validateApiKey).toHaveBeenCalledWith('key-abc');
      expect(request['tenantId']).toBe('tenant-123');
      expect(request['apiKeyId']).toBe('key-abc');
      expect(request['rateLimitPerMin']).toBe(100);
    });

    it('throws UnauthorizedException when API key validation fails', async () => {
      const service = createMockApiKeyService({
        validateApiKey: jest.fn().mockRejectedValue(new Error('Key revoked')),
      });
      const guard = new ApiKeyGuard(service as any);
      const { context } = makeGqlContext({
        'x-api-key': 'key-abc',
        'x-api-secret': 'secret-xyz',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });
});
