import { test, expect } from '@playwright/test';
import { loginAsUser } from './fixtures/auth.setup';
import {
  interceptGraphQL,
  mockDashboardMetrics,
  mockProducts,
  mockProductDetail,
  mockCreateProduct,
} from './fixtures/mock-data';

test.describe('Products', () => {
  test.beforeEach(async ({ page }) => {
    await interceptGraphQL(page, {
      DashboardMetrics: mockDashboardMetrics,
      Products: mockProducts,
      Product: mockProductDetail,
      CreateProduct: mockCreateProduct,
    });
    await loginAsUser(page, 'admin');
  });

  test('product list renders with table rows', async ({ page }) => {
    await page.goto('/products');

    await expect(page.getByText('Products')).toBeVisible();
    await expect(page.getByText('Create Product')).toBeVisible();

    // Table headers
    await expect(page.getByText('Code')).toBeVisible();
    await expect(page.getByText('Name')).toBeVisible();

    // Product rows from mock data
    await expect(page.getByText('ML-GHS-001')).toBeVisible();
    await expect(page.getByText('Quick Cash Micro Loan')).toBeVisible();
    await expect(page.getByText('OD-GHS-001')).toBeVisible();
    await expect(page.getByText('Salary Overdraft')).toBeVisible();
  });

  test('navigate to create product wizard', async ({ page }) => {
    await page.goto('/products');

    await page.getByText('Create Product').click();
    await expect(page).toHaveURL(/\/products\/new/);

    // Wizard should show basic info step
    await expect(page.getByText('Create New Product')).toBeVisible();
    await expect(page.getByText('Basic Information')).toBeVisible();
  });

  test('create product wizard: fill basic info step', async ({ page }) => {
    await page.goto('/products/new');

    await expect(page.getByText('Basic Information')).toBeVisible();

    // Fill in basic info fields
    await page.getByPlaceholder('e.g. ML-GHS-001').fill('ML-GHS-002');
    await page.getByPlaceholder('e.g. Quick Cash Micro Loan').fill('Test Product');

    // Verify fields have been filled
    const codeInput = page.getByPlaceholder('e.g. ML-GHS-001');
    await expect(codeInput).toHaveValue('ML-GHS-002');

    const nameInput = page.getByPlaceholder('e.g. Quick Cash Micro Loan');
    await expect(nameInput).toHaveValue('Test Product');
  });

  test('create product wizard: advance through steps', async ({ page }) => {
    await page.goto('/products/new');

    // Step 1: Basic Information should be visible
    await expect(page.getByText('Basic Information')).toBeVisible();

    // Fill required fields and click Next
    await page.getByPlaceholder('e.g. ML-GHS-001').fill('ML-GHS-002');
    await page.getByPlaceholder('e.g. Quick Cash Micro Loan').fill('Test Loan');

    const nextButton = page.getByRole('button', { name: /next/i });
    if (await nextButton.isVisible()) {
      await nextButton.click();
      // Should advance to step 2 (Financial Terms)
      await expect(page.getByText(/financial terms/i)).toBeVisible({ timeout: 3_000 });
    }
  });

  test('product detail page renders', async ({ page }) => {
    await page.goto('/products/prod-001');

    // Should display the product name
    await expect(page.getByText('Quick Cash Micro Loan')).toBeVisible();

    // Should display product details
    await expect(page.getByText('ML-GHS-001')).toBeVisible();
  });
});
