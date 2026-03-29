import { Page } from '@playwright/test';
import { createTokenForRole } from './mock-data';

export type UserRole = 'admin' | 'operator' | 'viewer' | 'platform_admin';

/**
 * Sets a fake JWT token in localStorage for the given role,
 * then navigates to the dashboard so the authenticated layout loads.
 */
export async function loginAsUser(page: Page, role: UserRole): Promise<void> {
  const token = createTokenForRole(role);

  // Navigate to the login page first so localStorage is on the correct origin
  await page.goto('/login');

  // Inject tokens into localStorage
  await page.evaluate(
    ({ accessToken }) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', 'mock-refresh-token');
    },
    { accessToken: token },
  );

  // Navigate to dashboard — the AuthProvider will read the token from localStorage
  await page.goto('/dashboard');
  // Wait for the layout to be fully rendered (sidebar is a reliable indicator)
  await page.waitForSelector('nav', { timeout: 10_000 });
}
