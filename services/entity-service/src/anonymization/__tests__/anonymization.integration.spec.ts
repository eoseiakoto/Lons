import { AnonymizationService } from '../anonymization.service';
import { EventType } from '@lons/event-contracts';

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
      count: jest.fn(),
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
    id: 'cust-abcd-1234-efgh',
    tenantId: 'tenant-anon-001',
    externalId: 'EXT-ANON-001',
    fullName: 'Kwame Mensah',
    email: 'kwame@example.com',
    phonePrimary: '+233241234567',
    phoneSecondary: '+233261234567',
    nationalId: 'GHA-987654321',
    dateOfBirth: new Date('1988-03-20'),
    kycLevel: 'tier_2',
    status: 'active',
    region: 'Greater Accra',
    city: 'Accra',
    country: 'GH',
    metadata: {
      occupation: 'trader',
      anonymizationConsent: true,
    },
    anonymizedAt: null,
    anonymizedBy: null,
    blacklistReason: null,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-08-01'),
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Anonymization Integration', () => {
  let service: AnonymizationService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let eventBus: ReturnType<typeof createMockEventBus>;

  const tenantId = 'tenant-anon-001';
  const customerId = 'cust-abcd-1234-efgh';
  const requestedBy = 'admin-user-anon';

  beforeEach(() => {
    prisma = createMockPrisma();
    eventBus = createMockEventBus();
    service = new AnonymizationService(prisma as any, eventBus as any);
  });

  // ─── Test 1: All contracts settled + consent → anonymization succeeds ─

  it('should anonymize all PII fields when contracts are settled and consent is given', async () => {
    const customer = makeCustomer();
    prisma.customer.findFirst.mockResolvedValue(customer);
    // No blocking contracts
    prisma.contract.findMany.mockResolvedValue([]);
    // No pending screenings
    prisma.screeningResult.count.mockResolvedValue(0);
    prisma.customer.update.mockResolvedValue({ ...customer, status: 'anonymized' });

    const result = await service.anonymizeCustomer(tenantId, customerId, requestedBy);

    expect(result.success).toBe(true);
    expect(result.customerId).toBe(customerId);
    expect(result.anonymizedAt).toBeDefined();
    expect(result.errors).toHaveLength(0);

    // Verify the update call has all PII replaced
    const updateCall = prisma.customer.update.mock.calls[0][0];
    const data = updateCall.data;

    expect(data.fullName).toMatch(/^ANON-/);
    expect(data.email).toMatch(/anon-.*@anonymized\.local/);
    expect(data.phonePrimary).toBe('+000000000000');
    expect(data.phoneSecondary).toBe('+000000000000');
    expect(data.nationalId).toMatch(/^ANON-NID-/);
    expect(data.dateOfBirth).toEqual(new Date('1900-01-01'));
    expect(data.status).toBe('anonymized');
    expect(data.anonymizedAt).toBeInstanceOf(Date);
    expect(data.anonymizedBy).toBe(requestedBy);
    expect(data.blacklistReason).toBeNull();

    // Region and city cleared
    expect(data.region).toBeNull();
    expect(data.city).toBeNull();

    // Metadata set to anonymization marker
    expect(data.metadata).toEqual(
      expect.objectContaining({ anonymized: true, anonymizedAt: expect.any(String) }),
    );

    // Events: requested + completed
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.CUSTOMER_ANONYMIZATION_REQUESTED,
      tenantId,
      expect.objectContaining({ customerId, requestedBy }),
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.CUSTOMER_ANONYMIZATION_COMPLETED,
      tenantId,
      expect.objectContaining({
        customerId,
        requestedBy,
        anonymizedAt: expect.any(String),
      }),
    );
  });

  // ─── Test 2: Active contract → rejected with ACTIVE_CONTRACT ───────

  it('should reject anonymization when customer has active contracts', async () => {
    const customer = makeCustomer();
    prisma.customer.findFirst.mockResolvedValue(customer);

    // Blocking contract exists (status: performing)
    prisma.contract.findMany
      .mockResolvedValueOnce([
        { id: 'c1', contractNumber: 'CTR-ACTIVE-001', status: 'performing', totalOutstanding: '3500.0000' },
      ])
      .mockResolvedValueOnce([
        { id: 'c1', contractNumber: 'CTR-ACTIVE-001', totalOutstanding: '3500.0000' },
      ]);
    prisma.screeningResult.count.mockResolvedValue(0);

    const result = await service.anonymizeCustomer(tenantId, customerId, requestedBy);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ANONYMIZATION_BLOCKED',
          message: expect.stringContaining('CTR-ACTIVE-001'),
        }),
      ]),
    );

    // Customer should NOT have been updated
    expect(prisma.customer.update).not.toHaveBeenCalled();

    // Blocked event emitted
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.CUSTOMER_ANONYMIZATION_BLOCKED,
      tenantId,
      expect.objectContaining({ customerId, requestedBy }),
    );
  });

  // ─── Test 3: Pending screening → rejected with PENDING_SCREENING_REVIEW ─

  it('should reject anonymization when customer has pending screening reviews', async () => {
    const customer = makeCustomer();
    prisma.customer.findFirst.mockResolvedValue(customer);
    // No blocking contracts
    prisma.contract.findMany.mockResolvedValue([]);
    // Pending screening exists
    prisma.screeningResult.count.mockResolvedValue(2);

    const result = await service.anonymizeCustomer(tenantId, customerId, requestedBy);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ANONYMIZATION_BLOCKED',
          message: expect.stringContaining('pending screening review'),
        }),
      ]),
    );
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  // ─── Test 4: Already anonymized + idempotency key → idempotent return ─

  it('should return idempotent success when customer is already anonymized', async () => {
    const anonymizedAt = new Date('2026-03-01T10:00:00Z');
    const anonymizedCustomer = makeCustomer({
      status: 'anonymized',
      anonymizedAt,
      fullName: 'ANON-cust-a',
      email: 'anon-cust-a@anonymized.local',
    });

    // With idempotency key, service checks if already anonymized first
    prisma.customer.findFirst.mockResolvedValue(anonymizedCustomer);

    const result = await service.anonymizeCustomer(
      tenantId,
      customerId,
      requestedBy,
      'idem-key-anon-001',
    );

    expect(result.success).toBe(true);
    expect(result.customerId).toBe(customerId);
    expect(result.anonymizedAt).toBe(anonymizedAt.toISOString());
    expect(result.errors).toHaveLength(0);

    // Should NOT have queried contracts or called update again
    expect(prisma.contract.findMany).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  // ─── Test 5: No consent → rejected with CONSENT_NOT_RECORDED ───────

  it('should reject anonymization when customer has not given consent', async () => {
    const customerNoConsent = makeCustomer({
      metadata: { occupation: 'trader' }, // no anonymizationConsent or deletionRequested
    });
    prisma.customer.findFirst.mockResolvedValue(customerNoConsent);
    // No blocking contracts
    prisma.contract.findMany.mockResolvedValue([]);
    // No pending screenings
    prisma.screeningResult.count.mockResolvedValue(0);

    const result = await service.anonymizeCustomer(tenantId, customerId, requestedBy);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ANONYMIZATION_BLOCKED',
          message: expect.stringContaining('consented'),
        }),
      ]),
    );
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  // ─── Test 6: Financial records remain intact after anonymization ────

  it('should not modify financial records (contracts, ledger) during anonymization', async () => {
    const customer = makeCustomer();
    prisma.customer.findFirst.mockResolvedValue(customer);
    // No blocking contracts
    prisma.contract.findMany.mockResolvedValue([]);
    // No pending screenings
    prisma.screeningResult.count.mockResolvedValue(0);
    prisma.customer.update.mockResolvedValue({ ...customer, status: 'anonymized' });

    await service.anonymizeCustomer(tenantId, customerId, requestedBy);

    // Only customer.update should have been called — no contract updates
    expect(prisma.customer.update).toHaveBeenCalledTimes(1);

    // The update should NOT touch financial-related fields
    const updateCall = prisma.customer.update.mock.calls[0][0];
    const data = updateCall.data;

    // These financial-identity fields should NOT be in the update
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('tenantId');
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('kycLevel');
    expect(data).not.toHaveProperty('country');

    // Verify only the expected PII fields + status fields are updated
    const expectedKeys = [
      'fullName',
      'email',
      'phonePrimary',
      'phoneSecondary',
      'nationalId',
      'dateOfBirth',
      'metadata',
      'status',
      'anonymizedAt',
      'anonymizedBy',
      'blacklistReason',
      'region',
      'city',
    ];
    for (const key of Object.keys(data)) {
      expect(expectedKeys).toContain(key);
    }
  });
});
