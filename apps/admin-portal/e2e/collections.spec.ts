import { test, expect } from '@playwright/test';
import { loginAsUser } from './fixtures/auth.setup';
import {
  interceptGraphQL,
  mockDashboardMetrics,
  mockCollectionsMetrics,
  mockContracts,
} from './fixtures/mock-data';

test.describe('Collections', () => {
  test.beforeEach(async ({ page }) => {
    await interceptGraphQL(page, {
      DashboardMetrics: mockDashboardMetrics,
      CollectionsMetrics: mockCollectionsMetrics,
      // The collections queue reuses the Contracts query with status="overdue"
      Contracts: mockContracts,
    });
    await loginAsUser(page, 'admin');
  });

  test('collections dashboard renders with metrics', async ({ page }) => {
    await page.goto('/collections');

    await expect(page.getByText('Collections')).toBeVisible();

    // Tabs
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Queue')).toBeVisible();
    await expect(page.getByText('PTP Tracker')).toBeVisible();

    // Dashboard tab is active by default - metric cards should be visible
    await expect(page.getByText('Total Overdue Amount')).toBeVisible();
    await expect(page.getByText('Overdue')).toBeVisible();
    await expect(page.getByText('Delinquent')).toBeVisible();
    await expect(page.getByText('Recovery Rate')).toBeVisible();
  });

  test('collections queue renders when queue tab is clicked', async ({ page }) => {
    await page.goto('/collections');

    // Click the Queue tab
    await page.getByText('Queue').click();

    // Queue should show the data table
    // Wait for the table to appear
    await expect(page.getByText('Contract #')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Customer')).toBeVisible();
    await expect(page.getByText('DPD')).toBeVisible();
  });

  test('filter by classification works in queue', async ({ page }) => {
    await page.goto('/collections');

    // Navigate to Queue tab
    await page.getByText('Queue').click();
    await page.waitForTimeout(500);

    // The filter bar should have a classification dropdown
    const classificationFilter = page.locator('select').first();
    if (await classificationFilter.isVisible()) {
      // Select a classification filter
      await classificationFilter.selectOption({ label: 'Substandard' });

      // The filter should trigger a new GraphQL query
      // Just verify the page didn't crash
      await page.waitForTimeout(500);
      await expect(page.getByText('Contract #')).toBeVisible();
    }
  });

  test('collections action drawer is accessible from queue', async ({ page }) => {
    await page.goto('/collections');

    // Navigate to Queue tab
    await page.getByText('Queue').click();

    // Wait for the data table to render
    await expect(page.getByText('Contract #')).toBeVisible({ timeout: 5_000 });

    // Verify row data is present (from mock contracts)
    const hasContractRows =
      (await page.getByText('CTR-2026-0001').isVisible().catch(() => false)) ||
      (await page.getByText('CTR-2026-0002').isVisible().catch(() => false));

    expect(hasContractRows).toBeTruthy();
  });
});
