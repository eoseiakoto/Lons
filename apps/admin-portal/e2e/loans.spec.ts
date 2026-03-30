import { test, expect } from '@playwright/test';
import { loginAsUser } from './fixtures/auth.setup';
import {
  interceptGraphQL,
  mockDashboardMetrics,
  mockLoanRequests,
  mockContracts,
  mockContractDetail,
  mockEarlySettlementQuote,
} from './fixtures/mock-data';

test.describe('Loans', () => {
  test.beforeEach(async ({ page }) => {
    await interceptGraphQL(page, {
      DashboardMetrics: mockDashboardMetrics,
      LoanRequests: mockLoanRequests,
      Contracts: mockContracts,
      Contract: mockContractDetail,
      EarlySettlementQuote: mockEarlySettlementQuote,
    });
    await loginAsUser(page, 'admin');
  });

  test('application queue loads with entries', async ({ page }) => {
    await page.goto('/loans/applications');

    await expect(page.getByText('Application Queue')).toBeVisible();
    await expect(page.getByText('Review and process loan applications')).toBeVisible();

    // Table headers
    await expect(page.getByText('Customer')).toBeVisible();
    await expect(page.getByText('Product')).toBeVisible();
    await expect(page.getByText('Amount')).toBeVisible();

    // Application rows from mock data
    await expect(page.getByText('Kofi Mensah')).toBeVisible();
    await expect(page.getByText('Ama Owusu')).toBeVisible();
  });

  test('contract list renders', async ({ page }) => {
    await page.goto('/loans/contracts');

    await expect(page.getByText('Contracts')).toBeVisible();

    // Table headers
    await expect(page.getByText('Contract #')).toBeVisible();
    await expect(page.getByText('Principal')).toBeVisible();
    await expect(page.getByText('Outstanding')).toBeVisible();

    // Contract rows from mock data
    await expect(page.getByText('CTR-2026-0001')).toBeVisible();
    await expect(page.getByText('CTR-2026-0002')).toBeVisible();
  });

  test('contract detail page shows contract info', async ({ page }) => {
    await page.goto('/loans/contracts/con-001');

    // Contract number should be displayed
    await expect(page.getByText('CTR-2026-0001')).toBeVisible();

    // Customer info
    await expect(page.getByText('Kofi Mensah')).toBeVisible();

    // Contract terms section
    await expect(page.getByText('Contract Terms')).toBeVisible();
    await expect(page.getByText('Outstanding Balances')).toBeVisible();

    // Action buttons
    await expect(page.getByText('Record Payment')).toBeVisible();
    await expect(page.getByText('Early Settlement')).toBeVisible();

    // Tabs
    await expect(page.getByText('Schedule')).toBeVisible();
    await expect(page.getByText('Payment History')).toBeVisible();
    await expect(page.getByText('Ledger')).toBeVisible();
    await expect(page.getByText('Timeline')).toBeVisible();

    // Repayment schedule should be visible (default tab)
    // Installment numbers from mock data
    await expect(page.getByText('paid').first()).toBeVisible();
  });
});
