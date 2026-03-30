import { Page } from '@playwright/test';

// ─── Mock JWT Token Generator ────────────────────────────────────────────────

function createMockJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64url');
  // exp 24 hours from now
  const fullPayload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
    ...payload,
  };
  return `${encode(header)}.${encode(fullPayload)}.mock-signature`;
}

export function createTokenForRole(role: string): string {
  const permissions: Record<string, string[]> = {
    admin: ['*'],
    operator: ['loans:read', 'loans:write', 'customers:read', 'customers:write', 'products:read', 'reports:read'],
    viewer: ['loans:read', 'customers:read', 'products:read', 'reports:read'],
    platform_admin: ['*', 'platform:admin'],
  };

  return createMockJwt({
    sub: 'user-001',
    tenantId: 'tenant-001',
    role,
    permissions: permissions[role] || [],
  });
}

// ─── GraphQL Mock Responses ──────────────────────────────────────────────────

export const mockDashboardMetrics = {
  data: {
    portfolioMetrics: {
      activeLoans: 1247,
      activeOutstanding: '4850000.0000',
      totalDisbursed: '12500000.0000',
      parAt30: { count: 42, amount: '156000.0000', pct: 3.2 },
      nplRatio: 2.1,
      provisioning: { total: '320000.0000' },
    },
    collectionsMetrics: {
      overdueCount: 89,
      delinquentCount: 34,
      defaultCount: 12,
      totalInCollections: 135,
    },
  },
};

export const mockProducts = {
  data: {
    products: {
      edges: [
        {
          node: {
            id: 'prod-001',
            code: 'ML-GHS-001',
            name: 'Quick Cash Micro Loan',
            type: 'MICRO_LOAN',
            currency: 'GHS',
            status: 'active',
            interestRate: 5,
            maxActiveLoans: 3,
            version: 1,
            createdAt: '2026-01-15T10:30:00Z',
          },
        },
        {
          node: {
            id: 'prod-002',
            code: 'OD-GHS-001',
            name: 'Salary Overdraft',
            type: 'OVERDRAFT',
            currency: 'GHS',
            status: 'active',
            interestRate: 3.5,
            maxActiveLoans: 1,
            version: 2,
            createdAt: '2026-02-01T09:00:00Z',
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

export const mockProductDetail = {
  data: {
    product: {
      id: 'prod-001',
      code: 'ML-GHS-001',
      name: 'Quick Cash Micro Loan',
      description: 'Short-term micro loan product',
      type: 'MICRO_LOAN',
      currency: 'GHS',
      status: 'active',
      interestRateModel: 'FLAT',
      interestRate: 5,
      minAmount: 50,
      maxAmount: 5000,
      minTenorDays: 7,
      maxTenorDays: 90,
      repaymentMethod: 'EQUAL_INSTALLMENT',
      gracePeriodDays: 3,
      maxActiveLoans: 3,
      version: 1,
      createdAt: '2026-01-15T10:30:00Z',
      updatedAt: '2026-01-15T10:30:00Z',
    },
  },
};

export const mockCustomers = {
  data: {
    customers: {
      edges: [
        {
          node: {
            id: 'cust-001',
            externalId: 'EXT-001',
            fullName: 'Kofi Mensah',
            phonePrimary: '+233201234567',
            email: 'kofi@example.com',
            kycLevel: 'full',
            status: 'active',
            watchlist: false,
            country: 'GH',
            createdAt: '2026-01-10T08:00:00Z',
            activeLoansCount: 2,
            totalOutstanding: '1200.0000',
            currency: 'GHS',
            riskStatus: 'low',
          },
        },
        {
          node: {
            id: 'cust-002',
            externalId: 'EXT-002',
            fullName: 'Ama Owusu',
            phonePrimary: '+233209876543',
            email: 'ama@example.com',
            kycLevel: 'basic',
            status: 'active',
            watchlist: false,
            country: 'GH',
            createdAt: '2026-02-05T14:30:00Z',
            activeLoansCount: 1,
            totalOutstanding: '500.0000',
            currency: 'GHS',
            riskStatus: 'medium',
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

export const mockCustomerDetail = {
  data: {
    customer: {
      id: 'cust-001',
      externalId: 'EXT-001',
      externalSource: 'wallet',
      fullName: 'Kofi Mensah',
      gender: 'M',
      country: 'GH',
      region: 'Greater Accra',
      city: 'Accra',
      nationalId: 'GHA-***-XXX',
      phonePrimary: '+233***4567',
      email: 'k***@example.com',
      kycLevel: 'full',
      status: 'active',
      blacklistReason: null,
      watchlist: false,
      creditScore: 720,
      creditLimit: '5000.0000',
      creditUtilization: 24,
      currency: 'GHS',
      activeLoansCount: 2,
      totalOutstanding: '1200.0000',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-03-20T12:00:00Z',
    },
  },
};

export const mockContracts = {
  data: {
    contracts: {
      edges: [
        {
          node: {
            id: 'con-001',
            contractNumber: 'CTR-2026-0001',
            customerId: 'cust-001',
            productId: 'prod-001',
            currency: 'GHS',
            principalAmount: '1000.0000',
            totalOutstanding: '850.0000',
            daysPastDue: 0,
            status: 'performing',
            classification: 'current',
            repaymentMethod: 'equal_installment',
            startDate: '2026-02-01',
            maturityDate: '2026-05-01',
            createdAt: '2026-02-01T10:00:00Z',
            customer: { id: 'cust-001', fullName: 'Kofi Mensah', externalId: 'EXT-001' },
            product: { id: 'prod-001', name: 'Quick Cash Micro Loan', productType: 'MICRO_LOAN' },
          },
        },
        {
          node: {
            id: 'con-002',
            contractNumber: 'CTR-2026-0002',
            customerId: 'cust-002',
            productId: 'prod-002',
            currency: 'GHS',
            principalAmount: '2500.0000',
            totalOutstanding: '2100.0000',
            daysPastDue: 15,
            status: 'overdue',
            classification: 'watch',
            repaymentMethod: 'bullet',
            startDate: '2026-01-15',
            maturityDate: '2026-04-15',
            createdAt: '2026-01-15T09:00:00Z',
            customer: { id: 'cust-002', fullName: 'Ama Owusu', externalId: 'EXT-002' },
            product: { id: 'prod-002', name: 'Salary Overdraft', productType: 'OVERDRAFT' },
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

export const mockContractDetail = {
  data: {
    contract: {
      id: 'con-001',
      contractNumber: 'CTR-2026-0001',
      customerId: 'cust-001',
      productId: 'prod-001',
      lenderId: 'lender-001',
      currency: 'GHS',
      principalAmount: '1000.0000',
      interestRate: 5,
      interestAmount: '50.0000',
      totalFees: '20.0000',
      totalCostCredit: '1070.0000',
      outstandingPrincipal: '700.0000',
      outstandingInterest: '30.0000',
      outstandingFees: '10.0000',
      outstandingPenalties: '0.0000',
      totalOutstanding: '740.0000',
      totalPaid: '330.0000',
      daysPastDue: 0,
      tenorDays: 90,
      status: 'performing',
      classification: 'current',
      repaymentMethod: 'equal_installment',
      startDate: '2026-02-01',
      maturityDate: '2026-05-01',
      createdAt: '2026-02-01T10:00:00Z',
      customer: { id: 'cust-001', fullName: 'Kofi Mensah', externalId: 'EXT-001' },
      product: { id: 'prod-001', name: 'Quick Cash Micro Loan' },
    },
    repaymentSchedule: [
      {
        id: 'sched-001',
        installmentNumber: 1,
        dueDate: '2026-03-01',
        principalAmount: '333.3333',
        interestAmount: '16.6667',
        feeAmount: '6.6667',
        totalAmount: '356.6667',
        paidAmount: '356.6667',
        status: 'paid',
        paidAt: '2026-02-28T15:00:00Z',
      },
      {
        id: 'sched-002',
        installmentNumber: 2,
        dueDate: '2026-04-01',
        principalAmount: '333.3333',
        interestAmount: '16.6667',
        feeAmount: '6.6667',
        totalAmount: '356.6667',
        paidAmount: '0',
        status: 'pending',
        paidAt: null,
      },
      {
        id: 'sched-003',
        installmentNumber: 3,
        dueDate: '2026-05-01',
        principalAmount: '333.3334',
        interestAmount: '16.6666',
        feeAmount: '6.6666',
        totalAmount: '356.6666',
        paidAmount: '0',
        status: 'pending',
        paidAt: null,
      },
    ],
  },
};

export const mockLoanRequests = {
  data: {
    loanRequests: {
      edges: [
        {
          node: {
            id: 'lr-001',
            customerId: 'cust-001',
            productId: 'prod-001',
            requestedAmount: '1000.0000',
            currency: 'GHS',
            status: 'manual_review',
            channel: 'USSD',
            createdAt: '2026-03-26T08:00:00Z',
            customer: { id: 'cust-001', fullName: 'Kofi Mensah', externalId: 'EXT-001' },
            product: { id: 'prod-001', name: 'Quick Cash Micro Loan', productType: 'MICRO_LOAN' },
            scoringResult: { score: 680, riskTier: 'medium' },
          },
        },
        {
          node: {
            id: 'lr-002',
            customerId: 'cust-002',
            productId: 'prod-002',
            requestedAmount: '2500.0000',
            currency: 'GHS',
            status: 'manual_review',
            channel: 'API',
            createdAt: '2026-03-26T09:30:00Z',
            customer: { id: 'cust-002', fullName: 'Ama Owusu', externalId: 'EXT-002' },
            product: { id: 'prod-002', name: 'Salary Overdraft', productType: 'OVERDRAFT' },
            scoringResult: { score: 550, riskTier: 'high' },
          },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

export const mockCollectionsMetrics = {
  data: {
    collectionsMetrics: {
      overdueCount: 89,
      delinquentCount: 34,
      defaultCount: 12,
      totalInCollections: 135,
      totalOverdueAmount: '2340000.0000',
      totalActions: 456,
      recoveryRate: 0.32,
      agingBuckets: [
        { bucket: '1-30 DPD', count: 89, amount: '890000.0000' },
        { bucket: '31-60 DPD', count: 23, amount: '560000.0000' },
        { bucket: '61-90 DPD', count: 11, amount: '450000.0000' },
        { bucket: '90+ DPD', count: 12, amount: '440000.0000' },
      ],
    },
  },
};

export const mockLoginSuccess = {
  data: {
    loginBySlug: {
      accessToken: createTokenForRole('admin'),
      refreshToken: 'mock-refresh-token',
    },
  },
};

export const mockLoginFailure = {
  errors: [
    {
      message: 'Invalid credentials',
      extensions: { code: 'UNAUTHENTICATED' },
    },
  ],
};

export const mockCreateProduct = {
  data: {
    createProduct: {
      id: 'prod-new',
      code: 'ML-GHS-002',
      name: 'Test Product',
      status: 'draft',
    },
  },
};

export const mockEarlySettlementQuote = {
  data: {
    earlySettlementQuote: {
      outstandingPrincipal: '700.0000',
      outstandingInterest: '30.0000',
      outstandingFees: '10.0000',
      outstandingPenalties: '0.0000',
      earlySettlementFee: '15.0000',
      totalSettlementAmount: '755.0000',
      currency: 'GHS',
      validUntil: '2026-03-28T23:59:59Z',
    },
  },
};

// ─── GraphQL Route Interceptor ───────────────────────────────────────────────

export type GraphQLMocks = Record<string, unknown>;

/**
 * Intercepts all GraphQL POST requests and returns mock data based on operationName.
 * Falls back to a generic empty-data response for unmatched operations.
 */
export async function interceptGraphQL(page: Page, mocks: GraphQLMocks): Promise<void> {
  await page.route('**/graphql', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }

    let operationName = '';
    try {
      const body = request.postDataJSON();
      operationName = body?.operationName || '';
    } catch {
      // If we can't parse the body, fall through
    }

    const mockResponse = mocks[operationName];
    if (mockResponse) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      });
    } else {
      // Return empty data for unmatched queries to prevent network errors
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    }
  });
}
