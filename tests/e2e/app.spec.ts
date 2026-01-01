import { test, expect } from '@playwright/test';

test.describe('BitBoard App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the homepage', async ({ page }) => {
    await expect(page).toHaveTitle(/BitBoard/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display app header', async ({ page }) => {
    const header = page.getByRole('banner');
    await expect(header).toBeVisible();
    await expect(header).toContainText('BITBOARD');
  });

  test('should show initial feed or welcome screen', async ({ page }) => {
    // Wait for initial load
    await page.waitForLoadState('networkidle');

    // Should show either posts or a welcome message
    const feed = page.locator('[data-testid="feed"]');
    const welcome = page.locator('[data-testid="welcome"]');

    await expect(feed.or(welcome)).toBeVisible();
  });
});
