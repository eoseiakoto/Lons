import { AnonymizationService } from '../anonymization.service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    contract: {
      findMany: jest.fn(),
    },
    screeningResult: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

function createMockEventBus() {
  return {
    emitAndBuild: jest.fn(),
  };
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1234-5678-abcd',
    tenantId: 'tenant-1',
    externalId: 'EXT-001',
    fullName: 'John Doe',
    email: 'john@example.com',
    phonePrimary: '+233241234567',
    phoneSecondary: '+233261234567',
    nationalId: 'GHA-123456789',
    dateOfBirth: new Date('1990-05-15'),
    kycLevel: 'tier_2',
    status: 'active',
    metadata: { occupation: 'trader', anonymizationConsent: true },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnonymizationService', () => {
  let service: AnonymizationService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    prisma = createMockPrisma();
    eventBus = createMockEventBus();
    service = new AnonymizationService(prisma as any, eventBus as any);
  });

  // =========================================================================
  // checkEligibility
  // =========================================================================

  describe('checkEligibility', () => {
    it('should return eligible when all contracts are settled and no outstanding balance', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());
      prisma.contract.findMany.mockResolvedValue([]);

      const result = await service.checkEligibility('tenant-1', 'cust-1234-5678-abcd');

      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should block when active contracts exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());

      // First call — blocking status check
      prisma.contract.findMany.mockResolvedValueOnce([
        { id: 'c1', contractNumber: 'CTR-001', status: 'active', totalOutstanding: '500.0000' },
      ]);
      // Second call — outstanding balance check
      prisma.contract.findMany.mockResolvedValueOnce([
        { id: 'c1', contractNumber: 'CTR-001', totalOutstanding: '500.0000' },
      ]);

      const result = await service.checkEligibility('tenant-1', 'cust-1234-5678-abcd');

      expect(result.eligible).toBe(false);
      expect(result.reasons).toEqual(
        expect.arrayContaining([expect.stringContaining('CTR-001')]),
      );
    });

    it('should block when customer status is already anonymized', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ status: 'anonymized' }));

      const result = await service.checkEligibility('tenant-1', 'cust-1234-5678-abcd');

      expect(result.eligible).toBe(false);
      expect(result.reasons).toEqual(
        expect.arrayContaining([expect.stringContaining('already been anonymized')]),
      );
      // Should not have queried contracts at all
      expect(prisma.contract.findMany).not.toHaveBeenCalled();
    });

    it('should block when contracts have outstanding balance even if status is settled', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());

      // No blocking-status contracts
      prisma.contract.findMany.mockResolvedValueOnce([]);
      // But there is an outstanding balance on a settled contract
      prisma.contract.findMany.mockResolvedValueOnce([
        { id: 'c2', contractNumber: 'CTR-002', totalOutstanding: '100.0000' },
      ]);

      const result = await service.checkEligibility('tenant-1', 'cust-1234-5678-abcd');

      expect(result.eligible).toBe(false);
      expect(result.reasons).toEqual(
        expect.arrayContaining([expect.stringContaining('outstanding balance')]),
      );
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.checkEligibility('tenant-1', 'nonexistent'),
      ).rejects.toThrow('Customer');
    });
  });

  // =========================================================================
  // anonymizeCustomer
  // =========================================================================

  describe('anonymizeCustomer', () => {
    it('should anonymize all PII fields correctly', async () => {
      const customer = makeCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.contract.findMany.mockResolvedValue([]);
      prisma.customer.update.mockResolvedValue({ ...customer, status: 'anonymized' });

      const result = await service.anonymizeCustomer('tenant-1', 'cust-1234-5678-abcd', 'admin-user-1');

      expect(result.success).toBe(true);
      expect(result.customerId).toBe('cust-1234-5678-abcd');
      expect(result.anonymizedAt).toBeDefined();
      expect(result.errors).toHaveLength(0);

      // Verify the update call
      const updateCall = prisma.customer.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'cust-1234-5678-abcd' });

      const data = updateCall.data;
      expect(data.fullName).toBe('ANON-cust-1');
      expect(data.email).toBe('anon-cust-1@anonymized.local');
      expect(data.phonePrimary).toBe('+000000000000');
      expect(data.phoneSecondary).toBe('+000000000000');
      expect(data.nationalId).toBe('ANON-NID-cust-1');
      expect(data.dateOfBirth).toEqual(new Date('1900-01-01'));
      expect(data.status).toBe('anonymized');
      expect(data.metadata).toEqual(
        expect.objectContaining({ anonymized: true, anonymizedAt: expect.any(String) }),
      );
      expect(data.anonymizedAt).toBeInstanceOf(Date);
      expect(data.anonymizedBy).toBe('admin-user-1');
    });

    it('should preserve non-PII fields (not included in update)', async () => {
      const customer = makeCustomer();
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.contract.findMany.mockResolvedValue([]);
      prisma.customer.update.mockResolvedValue({ ...customer, status: 'anonymized' });

      await service.anonymizeCustomer('tenant-1', 'cust-1234-5678-abcd', 'admin-user-1');

      const updateCall = prisma.customer.update.mock.calls[0][0];
      const data = updateCall.data;

      // These fields should NOT be in the update (preserved as-is)
      expect(data).not.toHaveProperty('id');
      expect(data).not.toHaveProperty('tenantId');
      expect(data).not.toHaveProperty('createdAt');
      expect(data).not.toHaveProperty('kycLevel');
      expect(data).not.toHaveProperty('country');
    });

    it('should reject when customer is already anonymized', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ status: 'anonymized' }));

      const result = await service.anonymizeCustomer('tenant-1', 'cust-1234-5678-abcd', 'admin-user-1');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('ANONYMIZATION_BLOCKED');
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('should reject when active contracts exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());
      prisma.contract.findMany
        .mockResolvedValueOnce([
          { id: 'c1', contractNumber: 'CTR-001', status: 'performing', totalOutstanding: '200.0000' },
        ])
        .mockResolvedValueOnce([
          { id: 'c1', contractNumber: 'CTR-001', totalOutstanding: '200.0000' },
        ]);

      const result = await service.anonymizeCustomer('tenant-1', 'cust-1234-5678-abcd', 'admin-user-1');

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'ANONYMIZATION_BLOCKED' }),
        ]),
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('should emit CUSTOMER_ANONYMIZATION_REQUESTED event', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());
      prisma.contract.findMany.mockResolvedValue([]);
      prisma.customer.update.mockResolvedValue({});

      await service.anonymizeCustomer('tenant-1', 'cust-1234-5678-abcd', 'admin-user-1');

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        'customer.anonymization.requested',
        'tenant-1',
        expect.objectContaining({ customerId: 'cust-1234-5678-abcd', requestedBy: 'admin-user-1' }),
      );
    });

    it('should emit CUSTOMER_ANONYMIZATION_COMPLETED event on success', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());
      prisma.contract.findMany.mockResolvedValue([]);
      prisma.customer.update.mockResolvedValue({});

      await service.anonymizeCustomer('tenant-1', 'cust-1234-5678-abcd', 'admin-user-1');

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        'customer.anonymization.completed',
        'tenant-1',
        expect.objectContaining({
          customerId: 'cust-1234-5678-abcd',
          requestedBy: 'admin-user-1',
          anonymizedAt: expect.any(String),
        }),
      );
    });

    it('should emit CUSTOMER_ANONYMIZATION_BLOCKED event when ineligible', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ status: 'anonymized' }));

      await service.anonymizeCustomer('tenant-1', 'cust-1234-5678-abcd', 'admin-user-1');

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        'customer.anonymization.blocked',
        'tenant-1',
        expect.objectContaining({ customerId: 'cust-1234-5678-abcd' }),
      );
    });
  });
});
