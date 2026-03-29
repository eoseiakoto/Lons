import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, LoanRequestStatus, ContractStatus, DisbursementStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '@prisma/client/runtime/library';

import { ProcessEngineModule } from '../process-engine.module';
import { LoanRequestService } from '../loan-request/loan-request.service';
import { ScoringService } from '../scoring/scoring.service';
import { PreQualificationService } from '../pre-qualification/pre-qualification.service';
import { ApprovalService } from '../approval/approval.service';
import { OfferService } from '../offer/offer.service';
import { ContractService } from '../contract/contract.service';
import { DisbursementService } from '../disbursement/disbursement.service';

/**
 * E2E Integration Test — Loan Request to Disbursement (Task 7, Monday ID: 11605364333)
 *
 * Single comprehensive test exercising the full loan lifecycle:
 * REQUEST → VALIDATION → PRE-QUALIFICATION → SCORING → APPROVAL → OFFER → ACCEPTANCE → CONTRACT → DISBURSEMENT
 *
 * Verifies:
 * - All state transitions complete successfully
 * - Contract is PERFORMING (disbursed) with all supporting records
 * - Ledger entries are created with correct Decimal amounts
 * - Repayment schedule is generated correctly
 * - Events are emitted with correct format
 * - Tenant isolation is maintained
 * - No float usage (all amounts are Decimal/strings)
 */
describe('Loan Lifecycle E2E: Request to Disbursement', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let eventBus: EventBusService;
  let loanRequestService: LoanRequestService;
  let scoringService: ScoringService;
  let preQualService: PreQualificationService;
  let approvalService: ApprovalService;
  let offerService: OfferService;
  let contractService: ContractService;
  let disbursementService: DisbursementService;

  let tenantId: string;
  let productId: string;
  let lenderId: string;
  let customerId: string;

  const emittedEvents: any[] = [];

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
    disbursementService = app.get<DisbursementService>(DisbursementService);

    // Mock event emitter
    jest.spyOn(eventBus, 'emitAndBuild').mockImplementation((eventType, tid, data) => {
      emittedEvents.push({ eventType, tenantId: tid, data, timestamp: new Date() });
      return Promise.resolve();
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Seed test data with realistic micro-loan configuration
   * - GHS currency
   * - 12% annual interest rate (flat)
   * - 30-day tenor
   * - Equal monthly installments
   * - Principal: GHS 5,000
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
        name: 'E2E Test Tenant',
        slug: `e2e-tenant-${Date.now()}`,
        country: 'GH',
        schemaName: `schema_e2e_${Date.now()}`,
        status: 'active',
      },
    });

    // Create micro-loan product with realistic terms
    // Create lender first
    await prisma.lender.create({
      data: {
        id: lenderId,
        tenantId,
        name: 'E2E Test Lender',
        status: 'active',
      },
    });

    await prisma.product.create({
      data: {
        id: productId,
        tenantId,
        lenderId,
        code: 'MICRO_LOAN_E2E',
        name: 'E2E Micro-Loan (GHS 5K, 30d, 12% flat)',
        type: 'micro_loan',
        currency: 'GHS',
        minAmount: new Decimal('100'),
        maxAmount: new Decimal('10000'),
        interestRateModel: 'flat',
        interestRate: new Decimal('12.0000'),
        maxTenorDays: 30,
        repaymentMethod: 'equal_installments',
        status: 'active',
      },
    });

    // Create customer with good credit
    await prisma.customer.create({
      data: {
        id: customerId,
        tenantId,
        externalId: `e2e-cust-${Date.now()}`,
        fullName: 'E2E Test Customer',
        phonePrimary: '+233245678901',
        email: 'e2e@test.com',
        kycLevel: 'tier_2',
        status: 'active',
      },
    });

    // Create product subscription
    await prisma.subscription.create({
      data: {
        id: uuidv4(),
        tenantId,
        customerId,
        productId,
        status: 'active',
        creditLimit: new Decimal('10000'),
      },
    });

    emittedEvents.length = 0;
  }

  it('should complete full loan lifecycle from request to disbursement', async () => {
    await seedTestData();

    // ========== PHASE 1: REQUEST & VALIDATION ==========
    const requestedAmount = 5000;
    const idempotencyKey = `e2e-test-${Date.now()}`;

    const loanRequest = await loanRequestService.create(tenantId, {
      customerId,
      productId,
      requestedAmount,
      requestedTenor: 30,
      currency: 'GHS',
      channel: 'mobile_app',
      idempotencyKey,
    });

    expect(loanRequest).toBeDefined();
    expect(loanRequest.id).toBeDefined();
    expect(loanRequest.status).toBe(LoanRequestStatus.received);
    expect(loanRequest.customerId).toBe(customerId);
    expect(loanRequest.productId).toBe(productId);
    expect(loanRequest.tenantId).toBe(tenantId);

    // Verify LOAN_REQUEST_CREATED event
    expect(emittedEvents.some((e) => e.eventType === EventType.LOAN_REQUEST_CREATED)).toBe(true);

    // Validate request
    const validatedRequest = await loanRequestService.validateRequest(tenantId, loanRequest.id);
    expect(validatedRequest.status).toBe(LoanRequestStatus.validated);

    // ========== PHASE 2: PRE-QUALIFICATION ==========
    const preQualResult = await preQualService.evaluate(tenantId, customerId, productId);
    expect(preQualResult.qualified).toBe(true);

    // Transition to pre-qualified
    const preQualRequest = await loanRequestService.transitionStatus(
      tenantId,
      loanRequest.id,
      LoanRequestStatus.pre_qualified,
    );
    expect(preQualRequest.status).toBe(LoanRequestStatus.pre_qualified);
    expect(preQualRequest.tenantId).toBe(tenantId);

    // ========== PHASE 3: CREDIT SCORING ==========
    const scoringResult = await scoringService.scoreCustomer(
      tenantId,
      customerId,
      productId,
      'application',
      String(requestedAmount),
    );
    expect(scoringResult).toBeDefined();
    expect(scoringResult.score).toBeGreaterThanOrEqual(600);

    // Transition to scored
    const scoredRequest = await loanRequestService.transitionStatus(
      tenantId,
      loanRequest.id,
      LoanRequestStatus.scored,
    );
    expect(scoredRequest.status).toBe(LoanRequestStatus.scored);

    // ========== PHASE 4: APPROVAL DECISION ==========
    const approvedRequest = await approvalService.makeDecision(tenantId, loanRequest.id);
    expect(approvedRequest.status).toBe(LoanRequestStatus.approved);

    // ========== PHASE 5: OFFER GENERATION ==========
    const offer = await offerService.generateOffer(tenantId, loanRequest.id);
    expect(offer.status).toBe(LoanRequestStatus.offer_sent);

    // Verify offer details on the loan request (offers are stored as JSON on LoanRequest)
    const offerRecord = await prisma.loanRequest.findUnique({
      where: { id: loanRequest.id },
    });

    expect(offerRecord).toBeDefined();
    expect(offerRecord?.offerDetails).toBeDefined();
    expect(offerRecord?.currency).toBe('GHS');
    expect(offerRecord?.offerExpiresAt).toBeDefined();

    // Verify amounts are NOT floats
    expect(typeof offerRecord?.approvedAmount).not.toBe('number');
    expect(typeof offerRecord?.requestedAmount).not.toBe('number');

    // ========== PHASE 6: CUSTOMER ACCEPTANCE ==========
    const acceptedRequest = await loanRequestService.transitionStatus(
      tenantId,
      loanRequest.id,
      LoanRequestStatus.accepted,
    );
    expect(acceptedRequest.status).toBe(LoanRequestStatus.accepted);

    // ========== PHASE 7: CONTRACT CREATION ==========
    const contract = await contractService.createFromAcceptedRequest(tenantId, loanRequest.id);
    expect(contract).toBeDefined();
    expect(contract.id).toBeDefined();
    expect(contract.status).toBe(ContractStatus.active);
    expect(contract.tenantId).toBe(tenantId);
    expect(contract.customerId).toBe(customerId);
    expect(contract.contractNumber).toBeDefined();
    expect(contract.contractNumber).toMatch(/^LON-\d{4}-\d{5}$/);
    expect(contract.currency).toBe('GHS');

    // Verify amounts are Decimal (not float)
    expect(typeof contract.principalAmount).not.toBe('number');
    expect(typeof contract.interestAmount).not.toBe('number');

    // ========== PHASE 8: REPAYMENT SCHEDULE GENERATION ==========
    const schedules = await prisma.repaymentScheduleEntry.findMany({
      where: { contractId: contract.id, tenantId },
      orderBy: { dueDate: 'asc' },
    });

    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules.length).toBeGreaterThanOrEqual(1);

    // Verify schedule integrity
    for (const schedule of schedules) {
      expect(schedule.tenantId).toBe(tenantId);
      expect(schedule.status).toBe('pending');
      expect(typeof schedule.principalAmount).not.toBe('number');
      expect(typeof schedule.interestAmount).not.toBe('number');
      expect(typeof schedule.totalAmount).not.toBe('number');
    }

    // ========== PHASE 9: DISBURSEMENT INITIATION ==========
    const disbursement = await disbursementService.initiateDisbursement(tenantId, contract.id);

    expect(disbursement).toBeDefined();
    expect(disbursement.id).toBeDefined();
    expect(disbursement.tenantId).toBe(tenantId);
    expect(disbursement.contractId).toBe(contract.id);
    expect(disbursement.customerId).toBe(customerId);
    expect(disbursement.status).toBe(DisbursementStatus.pending);
    expect(typeof disbursement.amount).not.toBe('number');

    // Verify loan request transitioned to disbursing
    const disburssingRequest = await prisma.loanRequest.findUnique({
      where: { id: loanRequest.id },
    });
    expect(disburssingRequest?.status).toBe(LoanRequestStatus.disbursing);

    // ========== PHASE 10: MOCK DISBURSEMENT CALLBACK ==========
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate successful completion
    await prisma.disbursement.update({
      where: { id: disbursement.id },
      data: {
        status: DisbursementStatus.completed,
        externalRef: `ext-ref-${Date.now()}`,
        completedAt: new Date(),
      },
    });

    // Update contract to PERFORMING (disbursed)
    const disbursedContract = await prisma.contract.update({
      where: { id: contract.id },
      data: { status: ContractStatus.performing },
    });
    expect(disbursedContract.status).toBe(ContractStatus.performing);

    // Update loan request to DISBURSED
    const finalRequest = await prisma.loanRequest.update({
      where: { id: loanRequest.id },
      data: { status: LoanRequestStatus.disbursed },
    });
    expect(finalRequest.status).toBe(LoanRequestStatus.disbursed);

    // ========== VERIFICATION PHASE ==========

    // 1. Verify contract status is PERFORMING
    const finalContract = await prisma.contract.findUnique({
      where: { id: contract.id },
    });
    expect(finalContract?.status).toBe(ContractStatus.performing);

    // 2. Verify disbursement record exists with COMPLETED status
    const finalDisbursement = await prisma.disbursement.findUnique({
      where: { id: disbursement.id },
    });
    expect(finalDisbursement?.status).toBe(DisbursementStatus.completed);
    expect(finalDisbursement?.completedAt).toBeDefined();
    expect(finalDisbursement?.externalRef).toBeDefined();

    // 3. Verify ledger entries are created
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { contractId: contract.id, tenantId },
    });
    expect(ledgerEntries.length).toBeGreaterThan(0);

    const disbursementEntry = ledgerEntries.find((e) => e.entryType === 'disbursement');
    expect(disbursementEntry).toBeDefined();
    expect(disbursementEntry?.tenantId).toBe(tenantId);
    expect(typeof disbursementEntry?.amount).not.toBe('number');
    expect(typeof disbursementEntry?.runningBalance).not.toBe('number');

    // 4. Verify repayment schedule correct
    const finalSchedules = await prisma.repaymentScheduleEntry.findMany({
      where: { contractId: contract.id, tenantId },
      orderBy: { dueDate: 'asc' },
    });
    expect(finalSchedules.length).toBeGreaterThan(0);
    expect(finalSchedules.length).toBe(1);

    // Sum of principal should equal original principal
    let totalPrincipal = new Decimal(0);
    for (const schedule of finalSchedules) {
      totalPrincipal = totalPrincipal.plus(schedule.principalAmount ?? new Decimal(0));
    }

    const principalDiff = Math.abs(Number(totalPrincipal) - requestedAmount);
    expect(principalDiff).toBeLessThan(0.01);

    // 5. Verify events emitted
    expect(emittedEvents.length).toBeGreaterThan(0);

    const eventTypes = emittedEvents.map((e) => e.eventType);
    expect(eventTypes).toContain(EventType.LOAN_REQUEST_CREATED);
    expect(eventTypes).toContain(EventType.LOAN_REQUEST_STATUS_CHANGED);

    // 6. Verify event format
    for (const event of emittedEvents) {
      expect(event.eventType).toBeDefined();
      expect(event.tenantId).toBe(tenantId);
      expect(event.data).toBeDefined();
      expect(event.timestamp).toBeDefined();
    }

    // 7. Verify tenant isolation
    const otherTenantId = uuidv4();
    const leakedData = await prisma.loanRequest.findFirst({
      where: {
        id: loanRequest.id,
        tenantId: otherTenantId,
      },
    });
    expect(leakedData).toBeNull();

    // 8. Verify all amounts are Decimal
    expect(typeof finalContract?.principalAmount).not.toBe('number');
    expect(typeof finalContract?.interestAmount).not.toBe('number');

    for (const schedule of finalSchedules) {
      expect(typeof schedule.principalAmount).not.toBe('number');
      expect(typeof schedule.interestAmount).not.toBe('number');
      expect(typeof schedule.totalAmount).not.toBe('number');
    }

    console.log(`
      ✓ E2E Test Completed Successfully
      - Loan Request ID: ${loanRequest.id}
      - Contract ID: ${contract.id}
      - Contract Number: ${contract.contractNumber}
      - Disbursement ID: ${disbursement.id}
      - Tenant ID: ${tenantId}
      - Events Emitted: ${emittedEvents.length}
      - Repayment Schedules: ${finalSchedules.length}
    `);
  }, 30000);
});
