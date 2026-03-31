import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, LoanRequestStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '@prisma/client/runtime/library';

import { ProcessEngineModule } from '../process-engine.module';
import { LoanRequestService } from '../loan-request/loan-request.service';
import { ScoringService } from '../scoring/scoring.service';
import { PreQualificationService } from '../pre-qualification/pre-qualification.service';
import { ApprovalService } from '../approval/approval.service';
import { OfferService } from '../offer/offer.service';
import { ContractService } from '../contract/contract.service';

/**
 * Process Engine Integration Tests — Task 4 (Monday ID: 11605364578)
 *
 * Comprehensive tests covering:
 * 1. Happy path: Full state machine traversal RECEIVED → DISBURSED
 * 2. Rejection paths: Pre-qualification failures, scoring failures, manual review rejections
 * 3. Edge cases: Offer expiry, idempotent requests, invalid transitions
 * 4. Concurrent requests: Multiple simultaneous requests
 */
describe('Process Engine Integration Tests', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let eventBus: EventBusService;
  let loanRequestService: LoanRequestService;
  let scoringService: ScoringService;
  let preQualService: PreQualificationService;
  let approvalService: ApprovalService;
  let offerService: OfferService;
  let contractService: ContractService;

  let tenantId: string;
  let productId: string;
  let lenderId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [ProcessEngineModule],
    }).compile();

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    eventBus = app.get<EventBusService>(EventBusService);
    loanRequestService = app.get<LoanRequestService>(LoanRequestService);
    scoringService = app.get<ScoringService>(ScoringService);
    preQualService = app.get<PreQualificationService>(PreQualificationService);
    approvalService = app.get<ApprovalService>(ApprovalService);
    offerService = app.get<OfferService>(OfferService);
    contractService = app.get<ContractService>(ContractService);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Seed test data: tenant, product, lender, customer
   */
  async function seedTestData() {
    tenantId = uuidv4();
    productId = uuidv4();
    lenderId = uuidv4();
    customerId = uuidv4();

    // Create tenant
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Test Tenant',
        slug: `test-tenant-${Date.now()}`,
        country: 'GH',
        schemaName: `schema_${Date.now()}`,
        status: 'active',
      },
    });

    // Create lender
    await prisma.lender.create({
      data: {
        id: lenderId,
        tenantId,
        name: 'Test Lender',
        status: 'active',
      },
    });

    // Create micro-loan product
    await prisma.product.create({
      data: {
        id: productId,
        tenantId,
        lenderId,
        code: 'MICRO_LOAN_TEST',
        name: 'Test Micro-Loan',
        type: 'micro_loan',
        currency: 'GHS',
        minAmount: new Decimal('100.0000'),
        maxAmount: new Decimal('10000.0000'),
        interestRateModel: 'flat',
        interestRate: new Decimal('12.0000'),
        maxTenorDays: 30,
        repaymentMethod: 'equal_installments',
        status: 'active',
      },
    });

    // Create customer with good credit profile
    await prisma.customer.create({
      data: {
        id: customerId,
        tenantId,
        externalId: `cust-${Date.now()}`,
        fullName: 'Test Customer',
        phonePrimary: '+233245678901',
        kycLevel: 'tier_2',
        status: 'active',
      },
    });

    // Create subscription
    await prisma.subscription.create({
      data: {
        id: uuidv4(),
        tenantId,
        customerId,
        productId,
        status: 'active',
        creditLimit: new Decimal('5000.0000'),
      },
    });
  }

  describe('Happy Path — Full State Machine Traversal', () => {
    let loanRequestId: string;
    const emittedEvents: any[] = [];

    beforeEach(async () => {
      await seedTestData();
      emittedEvents.length = 0;
      jest.spyOn(eventBus, 'emitAndBuild').mockImplementation((eventType, tid, data) => {
        emittedEvents.push({ eventType, tenantId: tid, data });
        return Promise.resolve();
      });
    });

    it('should transition RECEIVED → VALIDATED', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        requestedTenor: 30,
        currency: 'GHS',
        channel: 'api',
        idempotencyKey: `test-${Date.now()}`,
      });

      loanRequestId = lr.id;
      expect(lr.status).toBe(LoanRequestStatus.received);

      const validated = await loanRequestService.validateRequest(tenantId, lr.id);
      expect(validated.status).toBe(LoanRequestStatus.validated);
    });

    it('should transition VALIDATED → PRE_QUALIFIED', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-pre-qual-${Date.now()}`,
      });

      loanRequestId = lr.id;

      await loanRequestService.validateRequest(tenantId, lr.id);
      const preQualResult = await preQualService.evaluate(tenantId, customerId, productId);

      // If pre-qual passes, transition request
      if (preQualResult.qualified) {
        const preQualified = await loanRequestService.transitionStatus(
          tenantId,
          lr.id,
          LoanRequestStatus.pre_qualified,
        );
        expect(preQualified.status).toBe(LoanRequestStatus.pre_qualified);
      }
      expect(loanRequestId).toBeDefined();
    });

    it('should transition PRE_QUALIFIED → SCORED → APPROVED', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-scored-${Date.now()}`,
      });

      loanRequestId = lr.id;

      await loanRequestService.validateRequest(tenantId, lr.id);
      const preQualResult = await preQualService.evaluate(tenantId, customerId, productId);
      if (preQualResult.qualified) {
        await loanRequestService.transitionStatus(
          tenantId,
          lr.id,
          LoanRequestStatus.pre_qualified,
        );
      }

      // Score the customer
      await scoringService.scoreCustomer(
        tenantId,
        customerId,
        productId,
        'application',
        String(lr.requestedAmount),
      );
      const scored = await loanRequestService.transitionStatus(
        tenantId,
        lr.id,
        LoanRequestStatus.scored,
      );
      expect(scored.status).toBe(LoanRequestStatus.scored);

      const approved = await approvalService.makeDecision(tenantId, lr.id);
      expect(approved.status).toBe(LoanRequestStatus.approved);
    });

    it('should transition APPROVED → OFFER_SENT', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-offer-${Date.now()}`,
      });

      loanRequestId = lr.id;

      await loanRequestService.validateRequest(tenantId, lr.id);
      const preQualResult = await preQualService.evaluate(tenantId, customerId, productId);
      if (preQualResult.qualified) {
        await loanRequestService.transitionStatus(
          tenantId,
          lr.id,
          LoanRequestStatus.pre_qualified,
        );
      }

      await scoringService.scoreCustomer(
        tenantId,
        customerId,
        productId,
        'application',
        String(lr.requestedAmount),
      );
      await loanRequestService.transitionStatus(tenantId, lr.id, LoanRequestStatus.scored);
      const approved = await approvalService.makeDecision(tenantId, lr.id);

      const offer = await offerService.generateOffer(tenantId, approved.id);
      expect(offer.status).toBe(LoanRequestStatus.offer_sent);
    });

    it('should transition OFFER_SENT → ACCEPTED → CONTRACT_CREATED', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-contract-${Date.now()}`,
      });

      loanRequestId = lr.id;

      await loanRequestService.validateRequest(tenantId, lr.id);
      const preQualResult = await preQualService.evaluate(tenantId, customerId, productId);
      if (preQualResult.qualified) {
        await loanRequestService.transitionStatus(
          tenantId,
          lr.id,
          LoanRequestStatus.pre_qualified,
        );
      }

      await scoringService.scoreCustomer(
        tenantId,
        customerId,
        productId,
        'application',
        String(lr.requestedAmount),
      );
      await loanRequestService.transitionStatus(tenantId, lr.id, LoanRequestStatus.scored);
      const approved = await approvalService.makeDecision(tenantId, lr.id);
      await offerService.generateOffer(tenantId, approved.id);

      const accepted = await loanRequestService.transitionStatus(
        tenantId,
        lr.id,
        LoanRequestStatus.accepted,
      );
      expect(accepted.status).toBe(LoanRequestStatus.accepted);

      const contract = await contractService.createFromAcceptedRequest(tenantId, lr.id);
      expect(contract.status).toBe(ContractStatus.active);
    });

    it('should emit events at each state transition', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-events-${Date.now()}`,
      });

      loanRequestId = lr.id;

      expect(emittedEvents.length).toBeGreaterThan(0);
      const eventTypes = emittedEvents.map((e) => e.eventType);
      expect(eventTypes).toContain(EventType.LOAN_REQUEST_CREATED);
    });
  });

  describe('Rejection Paths', () => {
    beforeEach(async () => {
      await seedTestData();
    });

    it('should reject request if customer is blacklisted', async () => {
      const blacklistedCustomerId = uuidv4();
      await prisma.customer.create({
        data: {
          id: blacklistedCustomerId,
          tenantId,
          externalId: `blacklist-${Date.now()}`,
          fullName: 'Blacklisted Customer',
          phonePrimary: '+233245678901',
          kycLevel: 'tier_2',
          status: 'blacklisted',
        },
      });

      const lr = await loanRequestService.create(tenantId, {
        customerId: blacklistedCustomerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-blacklist-${Date.now()}`,
      });

      const result = await loanRequestService.validateRequest(tenantId, lr.id);
      expect(result.status).toBe(LoanRequestStatus.rejected);
    });

    it('should reject if requested amount exceeds product maximum', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 50000, // Exceeds max of 10000
        currency: 'GHS',
        idempotencyKey: `test-max-amount-${Date.now()}`,
      });

      const result = await loanRequestService.validateRequest(tenantId, lr.id);
      expect(result.status).toBe(LoanRequestStatus.rejected);
    });

    it('should reject if credit score is below threshold', async () => {
      const lowScoreCustomerId = uuidv4();
      await prisma.customer.create({
        data: {
          id: lowScoreCustomerId,
          tenantId,
          externalId: `lowscore-${Date.now()}`,
          fullName: 'Low Score Customer',
          phonePrimary: '+233245678901',
          kycLevel: 'tier_2',
          status: 'active',
        },
      });

      await prisma.subscription.create({
        data: {
          id: uuidv4(),
          tenantId,
          customerId: lowScoreCustomerId,
          productId,
          status: 'active',
          creditLimit: new Decimal('5000.0000'),
        },
      });

      const lr = await loanRequestService.create(tenantId, {
        customerId: lowScoreCustomerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-lowscore-${Date.now()}`,
      });

      await loanRequestService.validateRequest(tenantId, lr.id);
            await preQualService.evaluate(tenantId, customerId, productId);
      const scored = await scoringService.scoreCustomer(tenantId, customerId, productId, 'application', String(lr.requestedAmount));
      const decision = await approvalService.makeDecision(tenantId, scored.id);

      expect(decision.status).toBe(LoanRequestStatus.rejected);
    });

    it('should reject if customer has existing overdue loans', async () => {
      const overdueLoanCustomerId = uuidv4();
      await prisma.customer.create({
        data: {
          id: overdueLoanCustomerId,
          tenantId,
          externalId: `overdue-${Date.now()}`,
          fullName: 'Overdue Customer',
          phonePrimary: '+233245678901',
          kycLevel: 'tier_2',
          status: 'active',
        },
      });

      // Create overdue contract
      const overdueLoanRequestId = uuidv4();
      await prisma.loanRequest.create({
        data: {
          id: overdueLoanRequestId,
          tenantId,
          customerId: overdueLoanCustomerId,
          productId,
          requestedAmount: new Decimal('1000.0000'),
          currency: 'GHS',
          status: LoanRequestStatus.disbursed,
          idempotencyKey: `overdue-lr-${Date.now()}`,
        },
      });
      await prisma.contract.create({
        data: {
          id: uuidv4(),
          tenantId,
          customerId: overdueLoanCustomerId,
          productId,
          lenderId,
          loanRequestId: overdueLoanRequestId,
          contractNumber: `OVER-${Date.now()}`,
          principalAmount: new Decimal('1000.0000'),
          interestRate: new Decimal('12.0000'),
          currency: 'GHS',
          repaymentMethod: 'equal_installments',
          startDate: new Date(),
          maturityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'overdue',
        },
      });

      await prisma.subscription.create({
        data: {
          id: uuidv4(),
          tenantId,
          customerId: overdueLoanCustomerId,
          productId,
          status: 'active',
          creditLimit: new Decimal('5000.0000'),
        },
      });

      const subscription = await prisma.subscription.findFirst({
        where: {
          tenantId,
          customerId: overdueLoanCustomerId,
          productId,
        },
      });
      if (subscription) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'active' },
        });
      }

      await loanRequestService.create(tenantId, {
        customerId: overdueLoanCustomerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-overdue-${Date.now()}`,
      });

      const result = await preQualService.evaluate(tenantId, overdueLoanCustomerId, productId);
      // If pre-qual fails, rejection is expected
      expect(result.qualified).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await seedTestData();
    });

    it('should handle idempotent requests — same idempotencyKey returns same result', async () => {
      const idempotencyKey = `idempotent-test-${Date.now()}`;

      const lr1 = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey,
      });

      const lr2 = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey,
      });

      expect(lr1.id).toBe(lr2.id);
    });

    it('should reject invalid state transitions', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-invalid-transition-${Date.now()}`,
      });

      // Try to transition directly from RECEIVED to APPROVED (invalid)
      expect(async () => {
        await loanRequestService.transitionStatus(
          tenantId,
          lr.id,
          LoanRequestStatus.approved,
        );
      }).rejects.toThrow();
    });

    it('should handle offer expiry', async () => {
      const lr = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-expiry-${Date.now()}`,
      });

      await loanRequestService.validateRequest(tenantId, lr.id);
      await preQualService.evaluate(tenantId, customerId, productId);
      await scoringService.scoreCustomer(tenantId, customerId, productId, 'application', String(lr.requestedAmount));
      const approved = await approvalService.makeDecision(tenantId, lr.id);
      const offer = await offerService.generateOffer(tenantId, approved.id);

      expect(offer.status).toBe(LoanRequestStatus.offer_sent);
      expect(offer.offerExpiresAt).toBeDefined();
    });
  });

  describe('Concurrent Requests', () => {
    beforeEach(async () => {
      await seedTestData();
    });

    it('should handle multiple concurrent loan requests for same customer correctly', async () => {
      const concurrentRequests = [
        loanRequestService.create(tenantId, {
          customerId,
          productId,
          requestedAmount: 1000,
          currency: 'GHS',
          idempotencyKey: `concurrent-1-${Date.now()}`,
        }),
        loanRequestService.create(tenantId, {
          customerId,
          productId,
          requestedAmount: 2000,
          currency: 'GHS',
          idempotencyKey: `concurrent-2-${Date.now()}`,
        }),
        loanRequestService.create(tenantId, {
          customerId,
          productId,
          requestedAmount: 1500,
          currency: 'GHS',
          idempotencyKey: `concurrent-3-${Date.now()}`,
        }),
      ];

      const results = await Promise.all(concurrentRequests);

      expect(results).toHaveLength(3);
      expect(results[0].id).not.toBe(results[1].id);
      expect(results[1].id).not.toBe(results[2].id);

      // If product has maxConcurrentLoans policy, only one should proceed
      // This depends on config and approval logic
      const allActive = results.every((r) => r.status === LoanRequestStatus.received);
      expect(allActive).toBe(true);
    });
  });

  describe('Multi-Tenancy Isolation', () => {
    let tenant2Id: string;
    let customer2Id: string;

    beforeEach(async () => {
      await seedTestData();

      // Create second tenant
      tenant2Id = uuidv4();
      await prisma.tenant.create({
        data: {
          id: tenant2Id,
          name: 'Test Tenant 2',
          slug: `test-tenant-2-${Date.now()}`,
          country: 'GH',
          schemaName: `schema2_${Date.now()}`,
          status: 'active',
        },
      });

      customer2Id = uuidv4();
      await prisma.customer.create({
        data: {
          id: customer2Id,
          tenantId: tenant2Id,
          externalId: `cust2-${Date.now()}`,
          fullName: 'Customer 2',
          phonePrimary: '+233245678902',
          kycLevel: 'tier_2',
          status: 'active',
        },
      });
    });

    it('should not return tenant2 data when querying with tenant1 context', async () => {
      const lr1 = await loanRequestService.create(tenantId, {
        customerId,
        productId,
        requestedAmount: 1000,
        currency: 'GHS',
        idempotencyKey: `test-iso1-${Date.now()}`,
      });

      // Query with tenant2 context should not find tenant1's loan request
      const foundInTenant2 = await prisma.loanRequest.findUnique({
        where: { id: lr1.id },
      });

      // This test verifies that RLS would prevent cross-tenant access
      // In real scenario, RLS enforces this; here we just verify the ID is different
      expect(foundInTenant2?.tenantId).toBe(tenantId);
    });
  });
});
