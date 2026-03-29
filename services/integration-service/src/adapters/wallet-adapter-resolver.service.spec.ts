import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WalletAdapterResolver } from './wallet-adapter-resolver.service';
import { MockWalletAdapter } from './mock/mock-wallet.adapter';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }));
});

describe('WalletAdapterResolver', () => {
  let resolver: WalletAdapterResolver;
  let mockPrisma: { walletProviderConfig: { findFirst: jest.Mock } };
  let mockConfigService: { get: jest.Mock };
  let mockMtnMomoAdapter: Record<string, unknown>;
  let mockMpesaAdapter: Record<string, unknown>;
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const tenantId = 'tenant-001';

  const makeConfig = (providerType: string) => ({
    id: 'config-1',
    providerType,
    environmentMode: 'SANDBOX',
    configJson: null,
    credentialsSecretRef: null,
    apiBaseUrl: null,
    tenantId,
    isActive: true,
    isDefault: true,
    deletedAt: null,
  });

  beforeEach(() => {
    mockPrisma = {
      walletProviderConfig: { findFirst: jest.fn() },
    };
    mockConfigService = { get: jest.fn() };
    mockMtnMomoAdapter = { name: 'MtnMomoAdapter' };
    mockMpesaAdapter = { name: 'MpesaAdapter' };

    delete process.env.ALLOW_MOCK_ADAPTERS;

    resolver = new WalletAdapterResolver(
      mockPrisma as any,
      mockConfigService as any,
      mockMtnMomoAdapter as any,
      mockMpesaAdapter as any,
    );

    // Access the internally created Redis instance
    mockRedis = (resolver as any).redis;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ALLOW_MOCK_ADAPTERS;
  });

  it('resolves MOCK provider and returns a MockWalletAdapter instance', async () => {
    const config = makeConfig('MOCK');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    const adapter = await resolver.resolve(tenantId);

    expect(adapter).toBeInstanceOf(MockWalletAdapter);
  });

  it('resolves MTN_MOMO provider and returns the injected MtnMomoAdapter', async () => {
    const config = makeConfig('MTN_MOMO');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    const adapter = await resolver.resolve(tenantId);

    expect(adapter).toBe(mockMtnMomoAdapter);
  });

  it('resolves MPESA provider and returns the injected MpesaAdapter', async () => {
    const config = makeConfig('MPESA');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    const adapter = await resolver.resolve(tenantId);

    expect(adapter).toBe(mockMpesaAdapter);
  });

  it('resolves GENERIC provider and returns a GenericWalletAdapter instance', async () => {
    const config = makeConfig('GENERIC');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    const adapter = await resolver.resolve(tenantId);

    // GenericWalletAdapter is constructed internally; verify it is not one of the injected adapters
    expect(adapter).not.toBe(mockMtnMomoAdapter);
    expect(adapter).not.toBe(mockMpesaAdapter);
    expect(adapter).not.toBeInstanceOf(MockWalletAdapter);
    expect(adapter).toBeDefined();
  });

  it('throws ForbiddenException when ALLOW_MOCK_ADAPTERS=false and provider is MOCK', async () => {
    process.env.ALLOW_MOCK_ADAPTERS = 'false';
    const config = makeConfig('MOCK');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    await expect(resolver.resolve(tenantId)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when no active default config exists for the tenant', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(null);

    await expect(resolver.resolve(tenantId)).rejects.toThrow(NotFoundException);
  });

  it('returns cached config from Redis without querying Prisma', async () => {
    const cachedConfig = {
      id: 'config-1',
      providerType: 'MTN_MOMO',
      environmentMode: 'SANDBOX',
      configJson: null,
      credentialsSecretRef: null,
      apiBaseUrl: null,
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedConfig));

    const adapter = await resolver.resolve(tenantId);

    expect(adapter).toBe(mockMtnMomoAdapter);
    expect(mockRedis.get).toHaveBeenCalledWith(`wallet-config:${tenantId}`);
    expect(mockPrisma.walletProviderConfig.findFirst).not.toHaveBeenCalled();
  });

  it('on Redis cache miss, queries Prisma and caches result with 60s TTL', async () => {
    const config = makeConfig('MPESA');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    await resolver.resolve(tenantId);

    expect(mockPrisma.walletProviderConfig.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId,
        isActive: true,
        isDefault: true,
        deletedAt: null,
      },
    });
    expect(mockRedis.set).toHaveBeenCalledWith(
      `wallet-config:${tenantId}`,
      expect.any(String),
      'EX',
      60,
    );

    // Verify the cached payload shape
    const cachedPayload = JSON.parse(mockRedis.set.mock.calls[0][1]);
    expect(cachedPayload).toEqual({
      id: config.id,
      providerType: 'MPESA',
      environmentMode: 'SANDBOX',
      configJson: null,
      credentialsSecretRef: null,
      apiBaseUrl: null,
    });
  });

  it('falls back to DB when Redis is unavailable', async () => {
    const config = makeConfig('MTN_MOMO');
    mockRedis.get.mockRejectedValue(new Error('Connection refused'));
    mockRedis.set.mockRejectedValue(new Error('Connection refused'));
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    const adapter = await resolver.resolve(tenantId);

    expect(adapter).toBe(mockMtnMomoAdapter);
    expect(mockPrisma.walletProviderConfig.findFirst).toHaveBeenCalled();
  });

  it('invalidateCache calls redis.del with the correct key', async () => {
    mockRedis.del.mockResolvedValue(1);

    await resolver.invalidateCache(tenantId);

    expect(mockRedis.del).toHaveBeenCalledWith(`wallet-config:${tenantId}`);
  });

  it('throws NotFoundException for an unknown provider type', async () => {
    const config = makeConfig('UNKNOWN_PROVIDER');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.walletProviderConfig.findFirst.mockResolvedValue(config);

    await expect(resolver.resolve(tenantId)).rejects.toThrow(NotFoundException);
  });
});
