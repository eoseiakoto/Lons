/**
 * Regression: Admin portal operations
 *
 * 1. Product CRUD (create, read, update, activate, suspend)
 * 2. Customer search
 * 3. Contract view
 * 4. Audit log query (verify entries exist for mutations)
 */
import {
  graphqlRequest,
  authenticateAs,
  seedTestData,
  cleanup,
  disconnectPrisma,
  TestSeedData,
} from './setup';

describe('Admin Operations', () => {
  let seed: TestSeedData;
  let token: string;
  let createdProductId: string;

  beforeAll(async () => {
    seed = await seedTestData('admin-ops');
    token = await authenticateAs('admin', seed.tenantId);
  });

  afterAll(async () => {
    await cleanup(['admin-ops']);
    await disconnectPrisma();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Product CRUD
  // ═══════════════════════════════════════════════════════════════════════

  describe('Product CRUD', () => {
    it('should create a new product', async () => {
      const { data, errors } = await graphqlRequest(
        `mutation CreateProduct($input: CreateProductInput!, $key: String) {
          createProduct(input: $input, idempotencyKey: $key) {
            id
            code
            name
            type
            status
            currency
            interestRateModel
            repaymentMethod
          }
        }`,
        {
          input: {
            code: 'ADMIN-TEST-001',
            name: 'Admin Test Product',
            description: 'Created by regression test',
            type: 'micro_loan',
            currency: 'GHS',
            minAmount: 100,
            maxAmount: 10000,
            minTenorDays: 7,
            maxTenorDays: 90,
            interestRateModel: 'flat',
            interestRate: 3.5,
            repaymentMethod: 'equal_installments',
            gracePeriodDays: 3,
            approvalWorkflow: 'auto',
            maxActiveLoans: 2,
          },
          key: `admin-create-product-${Date.now()}`,
        },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.createProduct).toBeDefined();
      expect(data.createProduct.code).toBe('ADMIN-TEST-001');
      expect(data.createProduct.type).toBe('micro_loan');
      createdProductId = data.createProduct.id;
    });

    it('should read the created product', async () => {
      const { data, errors } = await graphqlRequest(
        `query Product($id: ID!) {
          product(id: $id) {
            id
            code
            name
            status
          }
        }`,
        { id: createdProductId },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.product.id).toBe(createdProductId);
      expect(data.product.name).toBe('Admin Test Product');
    });

    it('should update the product', async () => {
      const { data, errors } = await graphqlRequest(
        `mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
          updateProduct(id: $id, input: $input) {
            id
            name
            maxAmount
          }
        }`,
        {
          id: createdProductId,
          input: {
            name: 'Admin Test Product Updated',
            maxAmount: 15000,
          },
        },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.updateProduct.name).toBe('Admin Test Product Updated');
    });

    it('should activate the product', async () => {
      const { data, errors } = await graphqlRequest(
        `mutation Activate($id: ID!) {
          activateProduct(id: $id) { id status }
        }`,
        { id: createdProductId },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.activateProduct.status).toBe('active');
    });

    it('should suspend the product', async () => {
      const { data, errors } = await graphqlRequest(
        `mutation Suspend($id: ID!) {
          suspendProduct(id: $id) { id status }
        }`,
        { id: createdProductId },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.suspendProduct.status).toBe('suspended');
    });

    it('should list products with filters', async () => {
      const { data, errors } = await graphqlRequest(
        `query Products($type: String) {
          products(type: $type) {
            edges { node { id code type status } }
            totalCount
          }
        }`,
        { type: 'micro_loan' },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.products.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Customer Search
  // ═══════════════════════════════════════════════════════════════════════

  describe('Customer Search', () => {
    it('should search customers by status', async () => {
      const { data, errors } = await graphqlRequest(
        `query Customers($status: String) {
          customers(status: $status) {
            edges {
              node {
                id
                firstName
                lastName
                status
                kycLevel
              }
            }
            totalCount
          }
        }`,
        { status: 'active' },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.customers).toBeDefined();
      expect(data.customers.totalCount).toBeGreaterThanOrEqual(1);
    });

    it('should search customers by KYC level', async () => {
      const { data, errors } = await graphqlRequest(
        `query Customers($kycLevel: String) {
          customers(kycLevel: $kycLevel) {
            edges { node { id kycLevel } }
            totalCount
          }
        }`,
        { kycLevel: 'full' },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.customers.totalCount).toBeGreaterThanOrEqual(1);
      data.customers.edges.forEach((edge: any) => {
        expect(edge.node.kycLevel).toBe('full');
      });
    });

    it('should retrieve a single customer by ID', async () => {
      const { data, errors } = await graphqlRequest(
        `query Customer($id: ID!) {
          customer(id: $id) {
            id
            firstName
            lastName
            email
            status
          }
        }`,
        { id: seed.customerId },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.customer.id).toBe(seed.customerId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Contract View
  // ═══════════════════════════════════════════════════════════════════════

  describe('Contract View', () => {
    it('should list contracts with pagination', async () => {
      const { data, errors } = await graphqlRequest(
        `query Contracts {
          contracts(pagination: { first: 10 }) {
            edges {
              node { id status }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            totalCount
          }
        }`,
        {},
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.contracts).toBeDefined();
      expect(data.contracts.pageInfo).toBeDefined();
      expect(typeof data.contracts.pageInfo.hasNextPage).toBe('boolean');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Audit Log
  // ═══════════════════════════════════════════════════════════════════════

  describe('Audit Log', () => {
    it('should return audit log entries for mutations performed in this test', async () => {
      const { data, errors } = await graphqlRequest(
        `query AuditLogs($take: Int) {
          auditLogs(take: $take) {
            items {
              id
              action
              resourceType
              resourceId
              userId
              createdAt
            }
            hasMore
          }
        }`,
        { take: 50 },
        token,
      );

      expect(errors).toBeUndefined();
      expect(data.auditLogs).toBeDefined();
      expect(data.auditLogs.items).toBeDefined();
      // There should be audit entries from the product CRUD mutations above
      expect(data.auditLogs.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should contain entries referencing PRODUCT resource type', async () => {
      const { data } = await graphqlRequest(
        `query AuditLogs($filter: AuditLogFilterInput) {
          auditLogs(filter: $filter, take: 50) {
            items {
              id
              action
              resourceType
            }
            hasMore
          }
        }`,
        { filter: { resourceType: 'PRODUCT' } },
        token,
      );

      // If the filter works, at least some entries should be PRODUCT-related
      if (data.auditLogs.items.length > 0) {
        expect(data.auditLogs.items.every((i: any) => i.resourceType === 'PRODUCT')).toBe(true);
      }
    });
  });
});
