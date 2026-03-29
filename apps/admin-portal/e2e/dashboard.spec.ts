import { test, expect } from '@playwright/test';
import { loginAsUser } from './fixtures/auth.setup';
import { interceptGraphQL, mockDashboardMetrics } from './fixtures/mock-data';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await interceptGraphQL(page, {
      DashboardMetrics: mockDashboardMetrics,
    });
    await loginAsUser(page, 'admin');
  });

  test('renders key metric cards', async ({ page }) => {
    await expect(page.getByText('Executive Dashboard')).toBeVisible();

    // Verify metric cards are displayed
    await expect(page.getByText('Total Disbursed')).toBeVisible();
    await expect(page.getByText('Total Outstanding')).toBeVisible();
    await expect(page.getByText('Active Contracts')).toBeVisible();
    await expect(page.getByText('Overdue Contracts')).toBeVisible();

    // Second row metric cards
    await expect(page.getByText('Disbursements Today')).toBeVisible();
    await expect(page.getByText('Repayments Today')).toBeVisible();
    await expect(page.getByText('New Applications')).toBeVisible();
    await expect(page.getByText('Approval Rate')).toBeVisible();
  });

  test('charts render with Recharts containers', async ({ page }) => {
    // Recharts renders SVG elements inside .recharts-wrapper containers
    // Wait for the dynamic imports to load
    await page.waitForTimeout(2_000);

    // Check that chart titles are visible
    await expect(page.getByText('Disbursements (7-day)')).toBeVisible();
    await expect(page.getByText('Repayments (7-day)')).toBeVisible();
    await expect(page.getByText('Applications (7-day)')).toBeVisible();
    await expect(page.getByText('Approval Rate % (7-day)')).toBeVisible();

    // Check that Recharts SVG containers are present
    const rechartsContainers = page.locator('.recharts-wrapper');
    await expect(rechartsContainers.first()).toBeVisible({ timeout: 5_000 });
  });

  test('loading state displays skeleton cards', async ({ page }) => {
    // Create a new page with slow GraphQL response
    const slowPage = page;

    await slowPage.route('**/graphql', async (route) => {
      // Delay the response to observe loading state
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDashboardMetrics),
      });
    });

    await slowPage.goto('/dashboard');

    // Should show loading text or skeleton elements while data loads
    const loadingIndicator = slowPage.getByText('Loading...');
    const skeletonElements = slowPage.locator('[class*="animate-pulse"]');

    // Either loading text or skeleton cards should appear
    const hasLoadingState =
      (await loadingIndicator.isVisible().catch(() => false)) ||
      (await skeletonElements.count()) > 0;

    expect(hasLoadingState).toBeTruthy();
  });

  test('error state when GraphQL returns error', async ({ page }) => {
    // Override the interceptor with an error response
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Internal server error' }],
          data: null,
        }),
      });
    });

    await page.goto('/dashboard');

    // Should show an error message
    await expect(page.getByText(/failed to load metrics/i)).toBeVisible({ timeout: 5_000 });
  });
});
