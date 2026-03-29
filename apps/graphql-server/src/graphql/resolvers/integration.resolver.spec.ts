import { IntegrationResolver } from './integration.resolver';

describe('IntegrationResolver', () => {
  let resolver: IntegrationResolver;

  const mockConfig = {
    id: 'config-001',
    tenantId: 'tenant-001',
    providerType: 'MTN_MOMO',
    environmentMode: 'SANDBOX',
    displayName: 'TestProvider',
    apiBaseUrl: 'https://api.test.com',
    credentialsSecretRef: 'secret/wallet/test',
    webhookSigningKeyRef: null,
    configJson: {
      credentials: { apiKey: 'secret-key-123', apiSecret: 'super-secret' },
      tokenUrl: 'https://auth.test.com/token',
    },
    isActive: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockPrisma = {
    walletProviderConfig: {
      findMany: jest.fn().mockResolvedValue([mockConfig]),
      findFirst: jest.fn().mockResolvedValue(mockConfig),
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockConfig),
      create: jest.fn().mockResolvedValue(mockConfig),
      update: jest.fn().mockResolvedValue({ ...mockConfig, isActive: false, deletedAt: new Date() }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation((args: unknown[]) => Promise.all(args)),
  };

  const mockWalletAdapterResolver = {
    resolve: jest.fn().mockResolvedValue({
      getBalance: jest.fn().mockResolvedValue({ available: '50000', currency: 'GHS', lastUpdated: new Date() }),
    }),
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = new IntegrationResolver(
      mockPrisma as any,
      mockWalletAdapterResolver as any,
    );
  });

  describe('deactivateWalletProviderConfig', () => {
    it('should soft-delete a config by setting isActive to false and deletedAt', async () => {
      const result = await resolver.deactivateWalletProviderConfig('tenant-001', 'config-001');

      expect(mockPrisma.walletProviderConfig.findFirst).toHaveBeenCalledWith({
        where: { id: 'config-001', tenantId: 'tenant-001', deletedAt: null },
      });
      expect(mockPrisma.walletProviderConfig.update).toHaveBeenCalledWith({
        where: { id: 'config-001' },
        data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
      });
      expect(mockWalletAdapterResolver.invalidateCache).toHaveBeenCalledWith('tenant-001');
      expect(result).toBeDefined();
    });
  });

  describe('createWalletProviderConfig', () => {
    const input = {
      providerType: 'MTN_MOMO' as any,
      environmentMode: 'SANDBOX' as any,
      displayName: 'TestProvider',
      apiBaseUrl: 'https://api.test.com',
      configJson: { credentials: { apiKey: 'key' } },
    };

    it('should create a new config via prisma', async () => {
      await resolver.createWalletProviderConfig('tenant-001', input);

      expect(mockPrisma.walletProviderConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-001',
          providerType: 'MTN_MOMO',
          displayName: 'TestProvider',
        }),
      });
    });
  });

  describe('setDefaultWalletProvider', () => {
    it('should unset other defaults and set the specified config as default', async () => {
      mockPrisma.walletProviderConfig.findFirst.mockResolvedValueOnce({
        ...mockConfig,
        isActive: true,
      });

      await resolver.setDefaultWalletProvider('tenant-001', 'config-001');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockWalletAdapterResolver.invalidateCache).toHaveBeenCalledWith('tenant-001');
    });
  });

  describe('testWalletConnection', () => {
    it('should return success when adapter getBalance works', async () => {
      const result = await resolver.testWalletConnection('tenant-001', 'config-001');

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should return failure when config not found', async () => {
      mockPrisma.walletProviderConfig.findFirst.mockResolvedValueOnce(null);

      const result = await resolver.testWalletConnection('tenant-001', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should return failure when adapter throws', async () => {
      mockWalletAdapterResolver.resolve.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await resolver.testWalletConnection('tenant-001', 'config-001');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Connection refused');
    });
  });

  describe('field-level masking on configJson', () => {
    const userWithoutSensitiveScope = { scopes: ['integration:read'] };
    const userWithSensitiveScope = { scopes: ['integration:read', 'integration:read:sensitive'] };

    it('should mask credentials in configJson for users without sensitive scope', async () => {
      mockPrisma.walletProviderConfig.findFirst.mockResolvedValueOnce({ ...mockConfig });

      const result = await resolver.walletProviderConfig(
        'tenant-001',
        userWithoutSensitiveScope,
        'config-001',
      );

      expect(result.configJson).toBeDefined();
      const configJson = result.configJson as Record<string, unknown>;
      const credentials = configJson.credentials as Record<string, unknown>;
      expect(credentials.apiKey).toBe('***REDACTED***');
      expect(credentials.apiSecret).toBe('***REDACTED***');
    });

    it('should preserve non-sensitive fields in configJson', async () => {
      mockPrisma.walletProviderConfig.findFirst.mockResolvedValueOnce({ ...mockConfig });

      const result = await resolver.walletProviderConfig(
        'tenant-001',
        userWithoutSensitiveScope,
        'config-001',
      );

      const configJson = result.configJson as Record<string, unknown>;
      expect(configJson.tokenUrl).toBe('https://auth.test.com/token');
    });

    it('should NOT mask configJson for users with integration:read:sensitive scope', async () => {
      mockPrisma.walletProviderConfig.findFirst.mockResolvedValueOnce({ ...mockConfig });

      const result = await resolver.walletProviderConfig(
        'tenant-001',
        userWithSensitiveScope,
        'config-001',
      );

      const configJson = result.configJson as Record<string, unknown>;
      const credentials = configJson.credentials as Record<string, unknown>;
      expect(credentials.apiKey).toBe('secret-key-123');
      expect(credentials.apiSecret).toBe('super-secret');
    });

    it('should mask configJson in list queries for users without sensitive scope', async () => {
      mockPrisma.walletProviderConfig.findMany.mockResolvedValueOnce([{ ...mockConfig }]);

      const result = await resolver.walletProviderConfigs(
        'tenant-001',
        userWithoutSensitiveScope,
      );

      expect(result.edges.length).toBe(1);
      const configJson = result.edges[0].node.configJson as Record<string, unknown>;
      const credentials = configJson.credentials as Record<string, unknown>;
      expect(credentials.apiKey).toBe('***REDACTED***');
    });

    it('should NOT mask configJson in list queries for users with sensitive scope', async () => {
      mockPrisma.walletProviderConfig.findMany.mockResolvedValueOnce([{ ...mockConfig }]);

      const result = await resolver.walletProviderConfigs(
        'tenant-001',
        userWithSensitiveScope,
      );

      const configJson = result.edges[0].node.configJson as Record<string, unknown>;
      const credentials = configJson.credentials as Record<string, unknown>;
      expect(credentials.apiKey).toBe('secret-key-123');
    });

    it('should handle null/undefined user scopes gracefully', async () => {
      mockPrisma.walletProviderConfig.findFirst.mockResolvedValueOnce({ ...mockConfig });

      const result = await resolver.walletProviderConfig(
        'tenant-001',
        {} as any,
        'config-001',
      );

      const configJson = result.configJson as Record<string, unknown>;
      const credentials = configJson.credentials as Record<string, unknown>;
      expect(credentials.apiKey).toBe('***REDACTED***');
    });
  });
});
