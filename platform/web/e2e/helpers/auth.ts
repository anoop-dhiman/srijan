import { Page } from '@playwright/test';

export async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait for dashboard to appear
  await page.waitForSelector('[data-testid="dashboard"], h2:has-text("Workspaces")', { timeout: 10000 });
}
